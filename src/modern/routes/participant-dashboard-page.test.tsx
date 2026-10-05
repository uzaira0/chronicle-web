import { afterEach, describe, expect, setSystemTime, test } from 'bun:test';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { LanguageProvider } from '@/i18n';

import { ParticipantDashboardPage } from './participant-dashboard-page';

const originalFetch = globalThis.fetch;
const originalTz = process.env.TZ;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.TZ = originalTz;
  setSystemTime();
});

describe('ParticipantDashboardPage', () => {
  test('W08 links survey today and diary yesterday on the participant clock', async () => {
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
});
