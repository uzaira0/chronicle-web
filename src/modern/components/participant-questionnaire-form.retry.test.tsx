import { afterEach, describe, expect, test } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import { PARTICIPANT_CSRF_STORAGE_KEY } from '@/lib/participant-access';
import { studyOperationsApi } from '@/state/study-operations-api';

import { ParticipantQuestionnaireForm } from './participant-questionnaire-form';

const savedFetch = globalThis.fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status: 200 });
}

afterEach(() => {
  cleanup();
  window.sessionStorage.removeItem(PARTICIPANT_CSRF_STORAGE_KEY);
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
});

describe('ParticipantQuestionnaireForm retry after a failed submit', () => {
  async function keysForRetry(changeAnswer: boolean) {
    window.location.href = 'http://localhost/';
    window.sessionStorage.setItem(PARTICIPANT_CSRF_STORAGE_KEY, 'form-csrf');
    const postKeys: (string | null)[] = [];
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(String(input), init);
        if (request.method === 'POST') {
          postKeys.push(request.headers.get('Idempotency-Key'));
          // First attempt: server committed but the client saw a failure (timeout / 5xx).
          return Promise.resolve(
            new Response(postKeys.length === 1 ? 'gateway timeout' : '', { status: postKeys.length === 1 ? 504 : 200 }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            id: 'q1',
            questions: [{ choices: ['Daily', 'Never'], title: 'How often?' }],
            title: 'Habits',
          }),
        );
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

    fireEvent.click(await screen.findByLabelText('Daily'));
    const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Submit responses' }));
    submit();
    await waitFor(() => expect(postKeys).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Submit responses' })).toHaveProperty('disabled', false),
    );
    if (changeAnswer) fireEvent.click(screen.getByLabelText('Never'));
    submit();
    await waitFor(() => expect(postKeys).toHaveLength(2));
    expect(postKeys[0]).toBeTruthy();
    return postKeys;
  }

  test('reuses the same Idempotency-Key for the retry of one logical submission', async () => {
    const [first, retry] = await keysForRetry(false);
    expect(retry).toBe(first);
  });

  test('uses a fresh Idempotency-Key once the answers change, so the server does not reject the retry', async () => {
    const [first, retry] = await keysForRetry(true);
    expect(retry).toBeTruthy();
    expect(retry).not.toBe(first);
  });
});
