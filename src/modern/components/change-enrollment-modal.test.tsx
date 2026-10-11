import { afterEach, expect, test } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { LanguageProvider } from '@/i18n';
import { type ParticipationStatus, studyOperationsApi } from '@/state/study-operations-api';
import { createApiStore } from '@/test/study-operations-store';
import { ChangeEnrollmentModal } from './change-enrollment-modal';

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});
test('W09 Pause writes PAUSED, Resume writes ENROLLED, and initial enrollment is distinct', async () => {
  window.location.href = 'http://localhost/';
  for (const [status, label, expected] of [
    ['ENROLLED', 'Pause Enrollment', 'PAUSED'],
    ['PAUSED', 'Resume Enrollment', 'ENROLLED'],
    ['NOT_ENROLLED', 'Enroll Participant', 'ENROLLED'],
  ] as const) {
    const urls: string[] = [];
    globalThis.fetch = ((input: RequestInfo | URL) => {
      urls.push(input instanceof Request ? input.url : String(input));
      return Promise.resolve(new Response('{}'));
    }) as typeof fetch;
    const store = configureStore({
      reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
      middleware: (getDefault) => getDefault().concat(studyOperationsApi.middleware),
    });
    render(
      <Provider store={store}>
        <LanguageProvider initialSearch="">
          <ChangeEnrollmentModal
            studyId="s1"
            onClose={() => {}}
            participant={{
              candidate: { id: 'p1' },
              participantId: 'p1',
              participantTags: [],
              participationStatus: status satisfies ParticipationStatus,
            }}
          />
        </LanguageProvider>
      </Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(urls.length).toBe(1));
    expect(new URL(urls[0] ?? '').searchParams.get('participationStatus')).toBe(expected);
    cleanup();
  }
});

test.each([
  { participationStatus: 'NOT_ENROLLED' as const, withdrawnAt: '2026-10-07T14:00:00Z' },
  { participationStatus: 'ERASED' as const, withdrawnAt: null },
])('prevents enrollment changes after withdrawal or erasure: $participationStatus', (state) => {
  let requests = 0;
  globalThis.fetch = Object.assign(() => {
    requests += 1;
    return Promise.resolve(new Response('{}'));
  }, originalFetch);
  render(
    <Provider store={createApiStore()}>
      <LanguageProvider initialSearch="">
        <ChangeEnrollmentModal
          studyId="s1"
          onClose={() => {}}
          participant={{ candidate: { id: 'p1' }, participantId: 'p1', participantTags: [], ...state }}
        />
      </LanguageProvider>
    </Provider>,
  );
  const enroll = screen.getByRole<HTMLButtonElement>('button', { name: 'Enroll Participant' });
  expect(enroll.disabled).toBe(true);
  fireEvent.click(enroll);
  expect(requests).toBe(0);
  expect(screen.getByText('Enrollment cannot be changed after participant withdrawal or erasure.')).toBeTruthy();
});
