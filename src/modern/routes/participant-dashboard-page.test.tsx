import { afterEach, describe, expect, setSystemTime, test } from 'bun:test';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';

import { IDEMPOTENCY_KEY_HEADER } from '@/generated/chronicle-contracts';
import { LanguageProvider } from '@/i18n';
import { PARTICIPANT_CSRF_HEADER, storeParticipantSessionContext } from '@/lib/participant-access';

import { ParticipantDashboardPage } from './participant-dashboard-page';

const originalFetch = globalThis.fetch;
const originalTz = process.env.TZ;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.TZ = originalTz;
  setSystemTime();
});

describe('ParticipantDashboardPage', () => {
  // The first paint comes before any effect starts the history read; it must not tell the participant
  // that they have no submissions.
  test('the first paint of a complete link shows the history loading, not an empty window', () => {
    globalThis.fetch = (() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/participant?studyId=s1&participantId=p1']}>
        <ParticipantDashboardPage />
      </MemoryRouter>,
    );
    expect(markup).toContain('Loading submission history…');
    expect(markup).not.toContain('No time-use diary submissions');
  });
  test('retries submission history after a connection failure', async () => {
    let requests = 0;
    globalThis.fetch = (() => {
      requests++;
      return requests === 1 ? Promise.reject(new TypeError('offline')) : Promise.resolve(Response.json({}));
    }) as unknown as typeof fetch;
    render(
      <MemoryRouter initialEntries={['/participant?studyId=s1&participantId=p1']}>
        <ParticipantDashboardPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(requests).toBe(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
  test('links survey today and diary yesterday on the participant clock', async () => {
    process.env.TZ = 'America/Chicago';
    // 03:00Z on Oct 2 is still the evening of Oct 1 in Chicago.
    setSystemTime(new Date('2026-10-02T03:00:00Z'));
    globalThis.fetch = (() => Promise.resolve(new Response('{}'))) as unknown as typeof fetch;
    const search = '?studyId=study-1&participantId=participant-1';
    render(
      <LanguageProvider initialSearch={search}>
        <MemoryRouter initialEntries={[`/participant${search}`]}>
          <ParticipantDashboardPage />
        </MemoryRouter>
      </LanguageProvider>,
    );
    await act(async () => {});

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href') ?? '');
    const formLinks = hrefs.filter((href) => href.includes('date='));
    expect(formLinks.length).toBe(2);
    expect(formLinks.find((href) => href.includes('/survey?'))).toContain('date=2026-10-01');
    const diary = formLinks.find((href) => href.includes('/time-use-diary?')) ?? '';
    expect(diary).toContain('date=2026-09-30');
    expect(new URLSearchParams(diary.split('?')[1]).get('day')).toBe('yesterday');
  });

  const renderAt = (search: string) =>
    render(
      <MemoryRouter initialEntries={[`/participant${search}`]}>
        <ParticipantDashboardPage />
      </MemoryRouter>,
    );

  // A link copied without one of its ids cannot name a participant: say so, and ask the server nothing.
  test.each(['?studyId=s1', '?participantId=p1', '?studyId=%20&participantId=p1'])(
    'the incomplete link %s shows the incomplete panel without a request',
    async (search) => {
      let requests = 0;
      globalThis.fetch = (() => {
        requests++;
        return Promise.resolve(Response.json({}));
      }) as unknown as typeof fetch;
      renderAt(search);
      expect(await screen.findByText('Participant link is incomplete')).toBeTruthy();
      expect(screen.queryByRole('link')).toBeNull();
      await act(async () => {});
      expect(requests).toBe(0);
    },
  );

  test('history lists every submitted diary id, newest day first, skipping values that are not ids', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        Response.json({
          '2026-09-01': ['first-a', 'first-b'],
          '2026-09-03': 7,
          '2026-09-02': [null, { id: 'nested' }],
        }),
      )) as unknown as typeof fetch;
    renderAt('?studyId=s1&participantId=p1');
    await screen.findByText('submission id: 7');
    const ids = screen.getAllByText(/^submission id: /).map((row) => row.textContent);
    expect(ids).toEqual(['submission id: 7', 'submission id: first-a', 'submission id: first-b']);
    expect(screen.getAllByText('Time use diary')).toHaveLength(3);
    expect(screen.queryByText(/No time-use diary submissions/)).toBeNull();
  });

  // The participant's portal session authorizes the history read: its CSRF token travels with it.
  test('a participant portal session sends its CSRF token with the history read', async () => {
    storeParticipantSessionContext({
      csrfToken: 'portal-csrf',
      expiresAt: '2099-01-01T00:00:00Z',
      formKind: 'PORTAL',
      participantId: 'p1',
      studyId: 's1',
    });
    const sent: Headers[] = [];
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(new Headers(init?.headers));
      return Promise.resolve(Response.json({ '2026-09-01': ['diary-1'] }));
    }) as unknown as typeof fetch;
    try {
      renderAt('?studyId=s1&participantId=p1');
      expect(await screen.findByText('submission id: diary-1')).toBeTruthy();
      expect(sent).toHaveLength(1);
      expect(sent[0]?.get(PARTICIPANT_CSRF_HEADER)).toBe('portal-csrf');
      expect(sent[0]?.get(IDEMPOTENCY_KEY_HEADER)).toBeTruthy();
    } finally {
      window.sessionStorage.clear();
    }
  });

  // A server that answers with a bare list of ids, nothing, or a string has no day-keyed history to show.
  test.each([[['diary-1']], [null], ['legacy']])('a history payload of %j shows the empty window', async (payload) => {
    globalThis.fetch = (() => Promise.resolve(Response.json(payload))) as unknown as typeof fetch;
    renderAt('?studyId=s1&participantId=p1');
    expect(
      await screen.findByText('No time-use diary submissions were found for the recent 90-day window.'),
    ).toBeTruthy();
    expect(screen.queryByText(/^submission id: /)).toBeNull();
  });
});
