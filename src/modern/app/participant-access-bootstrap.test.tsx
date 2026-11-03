import { afterEach, describe, expect, mock, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { PARTICIPANT_PROCESSING_BLOCKED_CODE } from '@/generated/chronicle-contracts';
import { LanguageProvider } from '@/i18n';
import {
  participantAccessSessionUrl,
  readParticipantSessionContext,
  storeParticipantSessionContext,
} from '@/lib/participant-access';
import { ParticipantAccessBootstrap } from './participant-access-bootstrap';

const STUDY_ID = '28d661b8-a45a-41b6-aec4-ed9988fa28dc';
const CONTEXT = {
  csrfToken: 'csrf',
  expiresAt: '2099-01-01T00:00:00Z',
  formKind: 'APP_USAGE',
  participantId: 'participant-7',
  studyId: STUDY_ID,
};
const originalFetch = globalThis.fetch;

function renderAt(accessCode: string, query = `studyId=${STUDY_ID}&participantId=participant-7`) {
  render(
    <MemoryRouter initialEntries={[`/survey?${query}${accessCode ? `#accessCode=${accessCode}` : ''}`]}>
      <Routes>
        <Route
          element={
            <ParticipantAccessBootstrap>
              <p>form</p>
            </ParticipantAccessBootstrap>
          }
          path="survey"
        />
      </Routes>
    </MemoryRouter>,
  );
}

// A dropped connection during the one-time access-code exchange
// shows a translated sentence (not the browser's "Failed to fetch") and a retry that re-runs
// the exchange with the in-memory code, since the address bar no longer holds it.
describe('ParticipantAccessBootstrap network failure', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
    window.sessionStorage.clear();
  });

  test('hides the raw fetch error and retries the exchange', async () => {
    const fetchMock = mock()
      .mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')))
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify(CONTEXT), { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderAt('network-blip-code');

    expect(await screen.findByText('Participant access could not be established.')).toBeTruthy();
    expect(screen.getByText('Participant access unavailable')).toBeTruthy();
    expect(screen.queryByText('A new link is required')).toBeNull();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('form')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('recovers a committed exchange after its response was dropped using the same attempt', async () => {
    let committedAttempt: string | undefined;
    let calls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = (await new Request(input, init).json()) as { attemptId?: string };
      calls += 1;
      if (calls === 1) {
        committedAttempt = body.attemptId;
        throw new TypeError('response dropped after commit');
      }
      return body.attemptId && body.attemptId === committedAttempt
        ? Response.json(CONTEXT)
        : new Response('', { status: 410 });
    }) as typeof fetch;
    renderAt('commit-then-drop');
    await screen.findByText('Participant access could not be established.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('form')).toBeTruthy();
    expect(committedAttempt).toBeString();
  });

  test('forgets the exchange attempt once the server refuses the code for good', async () => {
    const intents = () => Object.keys(localStorage).filter((key) => key.startsWith('chronicle-create-intent:'));
    const before = intents().length;
    globalThis.fetch = ((input: RequestInfo | URL) =>
      Promise.resolve(
        new Response('', {
          status: new Request(input).url.endsWith('/participant-access/session') ? 401 : 410,
        }),
      )) as typeof fetch;
    renderAt('expired-code');
    expect(await screen.findByText('A new link is required')).toBeTruthy();
    expect(intents()).toHaveLength(before);
  });

  test('restores participant context from the HttpOnly cookie after a tab is closed', async () => {
    const requests: string[] = [];
    globalThis.fetch = ((input: RequestInfo | URL) => {
      requests.push(new URL(new Request(input).url).pathname);
      return Promise.resolve(Response.json(CONTEXT));
    }) as typeof fetch;
    renderAt('');
    expect(await screen.findByText('form')).toBeTruthy();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toBe(participantAccessSessionUrl());
  });

  test('shows a reversible processing block on cookie recovery and resumes after unblock', async () => {
    globalThis.fetch = mock()
      .mockImplementationOnce(() =>
        Promise.resolve(Response.json({ code: PARTICIPANT_PROCESSING_BLOCKED_CODE }, { status: 403 })),
      )
      .mockImplementationOnce(() => Promise.resolve(Response.json(CONTEXT))) as unknown as typeof fetch;
    renderAt('');
    expect(
      await screen.findByText(
        'Your study team has blocked processing for this participant. Contact them before continuing.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('A new link is required')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('form')).toBeTruthy();
  });

  test.each([401, 410])('offers no retry for a spent or invalid link (%s)', async (status) => {
    globalThis.fetch = mock((input: RequestInfo | URL) =>
      Promise.resolve(
        new Response('', {
          status: input === participantAccessSessionUrl() ? 401 : status,
        }),
      ),
    ) as unknown as typeof fetch;

    renderAt(`spent-code-${status}`);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('A new link is required')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  test.each([408, 429, 503])('retries %s with the same one-time code', async (status) => {
    const fetchMock = mock()
      .mockImplementationOnce(() => Promise.resolve(new Response('', { status })))
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify(CONTEXT))));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    renderAt(`temporary-code-${status}`);
    expect(
      await screen.findByText('The study server is temporarily busy or unavailable. Try again shortly.'),
    ).toBeTruthy();
    expect(screen.queryByText('A new link is required')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('form')).toBeTruthy();
    const requests = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(requests[1]?.[1].body).toBe(requests[0]?.[1].body);
  });

  test.each([
    [409, '', 'Study access is unavailable. Ask your study team to check your participation.'],
    [200, 'not-json', 'The study server returned an unreadable participant session response. Contact your study team.'],
  ])(
    'does not ask for a new link for inactive access or an unreadable response (%s)',
    async (status, body, message) => {
      globalThis.fetch = mock(() => Promise.resolve(new Response(body, { status }))) as unknown as typeof fetch;
      renderAt(`response-code-${status}`);
      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.getByText('Participant access unavailable')).toBeTruthy();
      expect(screen.queryByText('A new link is required')).toBeNull();
    },
  );

  test('retries browser storage without exchanging an already consumed code again', async () => {
    const fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify(CONTEXT))));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    // happy-dom's sessionStorage is a Proxy that spies cannot patch; swap the whole object.
    const realStorage = window.sessionStorage;
    const blocked = {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
    };
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: blocked });
    const setItem = {
      mockRestore: () => Object.defineProperty(window, 'sessionStorage', { configurable: true, value: realStorage }),
    };
    renderAt('storage-blocked-code');
    expect(
      await screen.findByText(
        'This browser could not save the participant session. Enable session storage or use another browser.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Participant access unavailable')).toBeTruthy();
    setItem.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('form')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// A context the server returns for another study, participant, form or day is never
// adopted, and the protected form (which would show that participant's app list) never renders.
describe('ParticipantAccessBootstrap scope isolation', () => {
  const OTHER_STUDY = '9b0f5c8e-5f43-4f0d-9d55-2a1f0e6c7b11';
  const route = `studyId=${STUDY_ID}&participantId=participant-7`;
  // Every row names its route query: bun passes a done callback in place of a missing column.
  const mismatches: [string, Record<string, string>, string][] = [
    ['another study', { studyId: OTHER_STUDY }, route],
    ['another participant', { participantId: 'participant-8' }, route],
    ['another form kind', { formKind: 'QUESTIONNAIRE', resourceId: 'questionnaire-1' }, route],
    ['another survey day', { logicalDate: '2026-04-03' }, `${route}&date=2026-04-04`],
  ];

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.sessionStorage.clear();
  });

  async function expectRefused() {
    expect(await screen.findByText('The participant link does not match this form.')).toBeTruthy();
    expect(screen.queryByText('form')).toBeNull();
    expect(readParticipantSessionContext()).toBeNull();
  }

  test.each(mismatches)('refuses an exchanged context for %s', async (_, override, query) => {
    globalThis.fetch = (() => Promise.resolve(Response.json({ ...CONTEXT, ...override }))) as unknown as typeof fetch;
    renderAt(`scope-${Object.keys(override).join('-')}`, query);
    await expectRefused();
  });

  test.each(mismatches)('refuses a cookie-recovered context for %s', async (_, override, query) => {
    const requests: string[] = [];
    globalThis.fetch = ((input: RequestInfo | URL) => {
      requests.push(new URL(new Request(input).url).pathname);
      return Promise.resolve(Response.json({ ...CONTEXT, ...override }));
    }) as typeof fetch;
    renderAt('', query);
    await expectRefused();
    expect(requests).toEqual([participantAccessSessionUrl()]);
  });

  // A pilot participant opening a spent link is told in Spanish to ask for a new one, without a retry.
  test('a spent link asks for a new link in Spanish', async () => {
    // The code is spent (410) and the cookie holds no session to recover (401).
    globalThis.fetch = ((input: RequestInfo | URL) =>
      Promise.resolve(
        new Response('', { status: new Request(input).url.endsWith(participantAccessSessionUrl()) ? 401 : 410 }),
      )) as typeof fetch;
    const view = render(
      <LanguageProvider initialSearch="?lang=es">
        <MemoryRouter initialEntries={[`/survey?studyId=${STUDY_ID}&participantId=participant-7#accessCode=spent-es`]}>
          <Routes>
            <Route
              element={
                <ParticipantAccessBootstrap>
                  <p>form</p>
                </ParticipantAccessBootstrap>
              }
              path="survey"
            />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>,
    );
    try {
      expect(await screen.findByText('Se requiere un nuevo enlace')).toBeTruthy();
      expect(
        screen.getByText('El enlace de un solo uso del participante no es válido, expiró o ya fue utilizado.'),
      ).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.queryByText('form')).toBeNull();
    } finally {
      view.unmount();
      render(<LanguageProvider initialSearch="?lang=en">{null}</LanguageProvider>).unmount();
    }
  });

  test("a tab holding another participant's context refuses the requested participant", async () => {
    // Tab A holds participant-7's context; the shared cookie still belongs to participant-7.
    storeParticipantSessionContext({ ...CONTEXT, formKind: 'APP_USAGE' });
    globalThis.fetch = (() => Promise.resolve(Response.json(CONTEXT))) as unknown as typeof fetch;
    renderAt('', `studyId=${STUDY_ID}&participantId=participant-8`);
    expect(await screen.findByText('The participant link does not match this form.')).toBeTruthy();
    expect(screen.queryByText('form')).toBeNull();
    expect(readParticipantSessionContext()?.participantId).toBe('participant-7');
  });

  test('a matching portal context opens the survey for its own participant only', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(Response.json({ ...CONTEXT, formKind: 'PORTAL' }))) as unknown as typeof fetch;
    renderAt('portal-code');
    expect(await screen.findByText('form')).toBeTruthy();
    expect(readParticipantSessionContext()?.participantId).toBe('participant-7');
  });
});
