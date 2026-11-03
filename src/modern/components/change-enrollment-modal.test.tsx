import { afterEach, expect, jest, mock, test } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { PARTICIPATION_STATUS } from '@/generated/chronicle-contracts';
import { LanguageProvider } from '@/i18n';
import { type ParticipationStatus, studyOperationsApi } from '@/state/study-operations-api';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';
import { ChangeEnrollmentModal } from './change-enrollment-modal';

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});
test('Pause writes PAUSED, Resume writes ENROLLED, and initial enrollment is distinct', async () => {
  window.location.href = 'http://localhost/';
  for (const [status, label, expected] of [
    [PARTICIPATION_STATUS.ENROLLED, 'Pause enrollment', PARTICIPATION_STATUS.PAUSED],
    [PARTICIPATION_STATUS.PAUSED, 'Resume enrollment', PARTICIPATION_STATUS.ENROLLED],
    [PARTICIPATION_STATUS.NOT_ENROLLED, 'Enroll participant', PARTICIPATION_STATUS.ENROLLED],
    [PARTICIPATION_STATUS.ENROLLED, 'Mark not enrolled', PARTICIPATION_STATUS.NOT_ENROLLED],
  ] as const) {
    const urls: string[] = [];
    const revisions: (string | null)[] = [];
    globalThis.fetch = routeFetch({
      'PATCH /chronicle/api/web/study/s1/participant/p1/status': (request) => {
        urls.push(request.url);
        revisions.push(request.headers.get('If-Match'));
        return Response.json({});
      },
    });
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
              statusRevision: 7,
            }}
          />
        </LanguageProvider>
      </Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(urls.length).toBe(1));
    expect(new URL(urls[0] ?? '').searchParams.get('participationStatus')).toBe(expected);
    expect(revisions[0]).toBe('"7"');
    if (expected === PARTICIPATION_STATUS.NOT_ENROLLED) {
      await waitFor(() => expect(screen.getByText(/Status updated to not enrolled/i)).toBeTruthy());
    }
    cleanup();
  }
});

test.each([
  { participationStatus: PARTICIPATION_STATUS.NOT_ENROLLED, withdrawnAt: '2026-10-07T14:00:00Z' },
  { participationStatus: PARTICIPATION_STATUS.ERASED, withdrawnAt: null },
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
  const enroll = screen.getByRole<HTMLButtonElement>('button', { name: 'Enroll participant' });
  expect(enroll.disabled).toBe(true);
  fireEvent.click(enroll);
  expect(requests).toBe(0);
  expect(screen.getByText('Enrollment cannot be changed after participant withdrawal or erasure.')).toBeTruthy();
});

test('completed collection explicitly asks before resuming capture', () => {
  render(
    <Provider store={createApiStore()}>
      <ChangeEnrollmentModal
        studyId="s1"
        onClose={() => {}}
        participant={{
          candidate: { id: 'p1' },
          participantId: 'p1',
          participantTags: [],
          participationStatus: PARTICIPATION_STATUS.COLLECTION_COMPLETED,
        }}
      />
    </Provider>,
  );
  expect(screen.getByText('Resume collecting data on p1?')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Resume enrollment' })).toBeTruthy();
});

function describedBy(button: HTMLElement): string {
  const ids = button.getAttribute('aria-describedby')?.split(' ') ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

test.each([
  PARTICIPATION_STATUS.ENROLLED,
  PARTICIPATION_STATUS.PAUSED,
  PARTICIPATION_STATUS.COLLECTION_COMPLETED,
  PARTICIPATION_STATUS.UNKNOWN,
  PARTICIPATION_STATUS.NOT_ENROLLED,
])('every offered enrollment change states its consequence: %s', (participationStatus) => {
  render(
    <Provider store={createApiStore()}>
      <LanguageProvider initialSearch="">
        <ChangeEnrollmentModal
          studyId="s1"
          onClose={() => {}}
          participant={{ candidate: { id: 'p1' }, participantId: 'p1', participantTags: [], participationStatus }}
        />
      </LanguageProvider>
    </Provider>,
  );
  const actions = screen
    .getAllByRole('button')
    .filter((button) => !['Cancel', 'Close'].includes(button.textContent ?? ''));
  expect(actions.length).toBeGreaterThan(0);
  for (const action of actions) expect(describedBy(action).trim()).not.toBe('');
  const markNotEnrolled = screen.queryByRole('button', { name: 'Mark not enrolled' });
  if (participationStatus === PARTICIPATION_STATUS.NOT_ENROLLED) {
    expect(markNotEnrolled).toBeNull();
    return;
  }
  expect(markNotEnrolled).toBeTruthy();
  const consequence = describedBy(markNotEnrolled as HTMLElement);
  expect(consequence).toContain('deletes data it has not uploaded yet');
  expect(consequence).toContain('Data already on the server stays');
  expect(consequence).toContain('Pause');
});

test('Pause keeps its confirmation text', () => {
  render(
    <Provider store={createApiStore()}>
      <LanguageProvider initialSearch="">
        <ChangeEnrollmentModal
          studyId="s1"
          onClose={() => {}}
          participant={{
            candidate: { id: 'p1' },
            participantId: 'p1',
            participantTags: [],
            participationStatus: PARTICIPATION_STATUS.ENROLLED,
          }}
        />
      </LanguageProvider>
    </Provider>,
  );
  expect(describedBy(screen.getByRole('button', { name: 'Pause enrollment' }))).toBe('Pause collecting data on p1?');
});

test('a pending status change cannot be dismissed, so its failure stays visible', async () => {
  const restoreRequest = installRelativeRequest();
  const response = Promise.withResolvers<Response>();
  const onClose = mock(() => undefined);
  globalThis.fetch = routeFetch({
    'PATCH /chronicle/api/web/study/s1/participant/p1/status': () => response.promise,
  });
  try {
    jest.useFakeTimers();
    render(
      <Provider store={createApiStore()}>
        <ChangeEnrollmentModal
          studyId="s1"
          onClose={onClose}
          participant={{
            candidate: { id: 'p1' },
            participantId: 'p1',
            participantTags: [],
            participationStatus: PARTICIPATION_STATUS.ENROLLED,
            statusRevision: 7,
          }}
        />
      </Provider>,
    );
    await act(() => jest.advanceTimersByTime(0));
    jest.useRealTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Pause enrollment' }));
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Pause enrollment' }).disabled).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.pointerDown(document.body, { button: 0, pointerType: 'mouse' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    await act(() => {
      response.resolve(Response.json({ message: 'Status unavailable' }, { status: 503 }));
      return response.promise;
    });
    expect((await screen.findByRole('alert')).textContent).not.toBe('');
    expect(onClose).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
    restoreRequest();
  }
});
