import { afterEach, describe, expect, test } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import {
  PARTICIPANT_CONTEXT_STORAGE_KEY,
  PARTICIPANT_CSRF_STORAGE_KEY,
  storeParticipantSessionContext,
} from '@/lib/participant-access';
import { studyOperationsApi } from '@/state/study-operations-api';

import { ParticipantQuestionnaireForm } from './participant-questionnaire-form';

const savedFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  window.sessionStorage.removeItem(PARTICIPANT_CONTEXT_STORAGE_KEY);
  window.sessionStorage.removeItem(PARTICIPANT_CSRF_STORAGE_KEY);
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
});

describe('participant session keepalive (W22)', () => {
  test('keeps answers through expired and offline checks, then clears the banner after recovery', async () => {
    window.location.href = 'http://localhost/';
    storeParticipantSessionContext({
      csrfToken: 'test-csrf',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      formKind: 'QUESTIONNAIRE',
      participantId: 'p1',
      resourceId: 'q1',
      studyId: 's1',
    });
    let keepaliveCalls = 0;
    let questionnaireLoaded = false;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(String(input), init);
        if (!questionnaireLoaded) {
          questionnaireLoaded = true;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'q1',
                questions: [{ choices: ['Daily', 'Never'], title: 'How often?' }],
                title: 'Habits',
              }),
              { headers: { 'Content-Type': 'application/json' }, status: 200 },
            ),
          );
        }
        if (request.headers.has('X-Chronicle-Form-CSRF')) {
          keepaliveCalls += 1;
          if (keepaliveCalls === 1) return Promise.resolve(new Response('', { status: 401 }));
          if (keepaliveCalls === 2) return Promise.reject(new TypeError('offline'));
          return Promise.resolve(new Response('', { status: 204 }));
        }
        return Promise.resolve(new Response('', { status: 204 }));
      },
      writable: true,
    });

    const store = configureStore({
      middleware: (getDefault) => getDefault().concat(studyOperationsApi.middleware),
      reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
    });
    render(
      <Provider store={store}>
        <ParticipantQuestionnaireForm participantId="p1" questionnaireId="q1" studyId="s1" />
      </Provider>,
    );

    const daily = await screen.findByLabelText<HTMLInputElement>('Daily');
    fireEvent.click(daily);
    await screen.findByText('Participant session expired');
    expect(daily.checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await screen.findByText('Unable to confirm participant session');
    expect(daily.checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(daily.checked).toBe(true);
    expect(keepaliveCalls).toBe(3);
  });
});
