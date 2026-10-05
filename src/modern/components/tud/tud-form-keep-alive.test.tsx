import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { LanguageProvider } from '@/i18n';
import { storeParticipantSessionContext } from '@/lib/participant-access';
import { PARTICIPANT_KEEP_ALIVE_MS } from '@/lib/participant-access-guard';

let submitFailed = false;

await mock.module('@/state/study-operations-api', () => ({
  useSubmitTimeUseDiaryMutation: () => [() => {}, { isError: submitFailed, isLoading: false, isSuccess: false }],
}));

const { TimeUseDiaryForm } = await import('./tud-form');
const { resolveTudSettings } = await import('./tud-page-settings');

const savedFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  submitFailed = false;
  window.sessionStorage.clear();
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
});

describe('TimeUseDiaryForm session keep-alive', () => {
  test('announces a failed submission once and retains the selected clock format', async () => {
    spyOn(window, 'scrollTo').mockImplementation(() => {});
    const makePage = () => (
      <LanguageProvider initialSearch="">
        <TimeUseDiaryForm
          activityDate="2026-10-01"
          activityDay="yesterday"
          effectiveCode="en"
          participantId="p1"
          settings={resolveTudSettings(new URLSearchParams(), undefined)}
          studyId="s1"
        />
      </LanguageProvider>
    );
    const view = render(makePage());
    fireEvent.click(screen.getByLabelText('24-hour clock format'));
    submitFailed = true;
    view.rerender(makePage());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('An error occurred while trying to submit survey. Please try again later.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByLabelText<HTMLInputElement>('24-hour clock format').checked).toBe(true);
  });

  test('refreshes the form session while a started diary is open', async () => {
    storeParticipantSessionContext({
      csrfToken: 'tab-csrf',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      formKind: 'TIME_USE_DIARY',
      participantId: 'p1',
      studyId: 's1',
    });
    const requests: Request[] = [];
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(new URL(String(input), 'http://localhost/'), init));
        return Promise.resolve(new Response('{}'));
      },
      writable: true,
    });
    const timers: Array<{ callback: () => void; delay: number | undefined }> = [];
    const setIntervalSpy = spyOn(window, 'setInterval').mockImplementation(((callback: () => void, delay?: number) => {
      timers.push({ callback, delay });
      return timers.length;
    }) as typeof window.setInterval);
    spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(
      <LanguageProvider initialSearch="">
        <TimeUseDiaryForm
          activityDate="2026-10-01"
          activityDay="yesterday"
          effectiveCode="en"
          participantId="p1"
          settings={resolveTudSettings(new URLSearchParams(), undefined)}
          studyId="s1"
        />
      </LanguageProvider>,
    );
    expect(timers.filter((timer) => timer.delay === PARTICIPANT_KEEP_ALIVE_MS)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    // One refresh as soon as the diary starts: the last request may be most of an idle period ago.
    await waitFor(() => expect(requests).toHaveLength(1));
    const keepAlive = timers.find((timer) => timer.delay === PARTICIPANT_KEEP_ALIVE_MS);
    expect(PARTICIPANT_KEEP_ALIVE_MS).toBeLessThan(30 * 60_000);
    keepAlive?.callback();
    await waitFor(() => expect(requests).toHaveLength(2));

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/chronicle/v3/time-use-diary/s1/settings',
      '/chronicle/v3/time-use-diary/s1/settings',
    ]);
    expect(requests[0]?.headers.get('X-Chronicle-Form-CSRF')).toBe('tab-csrf');
    setIntervalSpy.mockRestore();
  });
});
