import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import { PARTICIPANT_CSRF_STORAGE_KEY, storeParticipantSessionContext } from '@/lib/participant-access';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';

import { ParticipantQuestionnaireForm } from './participant-questionnaire-form';

const savedFetch = globalThis.fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status: 200 });
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
});

describe('ParticipantQuestionnaireForm retry after a failed submit', () => {
  async function keysForRetry(changeAnswer: boolean, remount = false) {
    window.location.href = 'http://localhost/';
    window.sessionStorage.setItem(PARTICIPANT_CSRF_STORAGE_KEY, 'form-csrf');
    const postKeys: (string | null)[] = [];
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: routeFetch({
        'POST /chronicle/v3/survey/s1/participant/p1/questionnaire/q1': (request) => {
          postKeys.push(request.headers.get('Idempotency-Key'));
          return new Response(postKeys.length === 1 ? 'gateway timeout' : '', {
            status: postKeys.length === 1 ? 504 : 200,
          });
        },
        'GET /chronicle/v3/survey/s1/questionnaire/q1': () =>
          jsonResponse({
            id: 'q1',
            questions: [{ choices: ['Daily', 'Never'], title: 'How often?' }],
            title: 'Habits',
          }),
      }),
      writable: true,
    });

    const store = createApiStore();
    const form = (
      <Provider store={store}>
        <ParticipantQuestionnaireForm participantId="p1" questionnaireId="q1" studyId="s1" />
      </Provider>
    );
    render(form);

    fireEvent.click(await screen.findByLabelText('Daily'));
    const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Submit responses' }));
    submit();
    await waitFor(() => expect(postKeys).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Submit responses' })).toHaveProperty('disabled', false),
    );
    if (remount) {
      cleanup();
      render(form);
      fireEvent.click(await screen.findByLabelText(changeAnswer ? 'Never' : 'Daily'));
    } else if (changeAnswer) fireEvent.click(screen.getByLabelText('Never'));
    submit();
    await waitFor(() => expect(postKeys).toHaveLength(2));
    expect(postKeys[0]).toBeTruthy();
    return postKeys;
  }

  test('reuses the same Idempotency-Key for the retry of one logical submission', async () => {
    const [first, retry] = await keysForRetry(false);
    expect(retry).toBe(first);
  });

  test('keeps the Idempotency-Key after answers change following an unacknowledged commit', async () => {
    const [first, retry] = await keysForRetry(true);
    expect(retry).toBeTruthy();
    expect(retry).toBe(first);
  });

  test('keeps the Idempotency-Key after remounting and changing answers following an unacknowledged commit', async () => {
    const [first, retry] = await keysForRetry(true, true);
    expect(retry).toBe(first);
  });

  test.each([
    [401, /Ask your study team to check your participation or provide a fresh link/],
    [403, /Ask your study team to check your participation or provide a fresh link/],
    [422, /Select one answer only/],
    [429, /server is temporarily busy or unavailable/],
    [503, /server is temporarily busy or unavailable/],
    ['transport', /could not reach the server; check your connection and try again/],
  ])('shows submission recovery for %s and retains answers', async (failure, message) => {
    const restoreRequest = installRelativeRequest();
    storeParticipantSessionContext({
      csrfToken: 'form-csrf',
      expiresAt: '2099-01-01T00:00:00Z',
      formKind: 'QUESTIONNAIRE',
      participantId: 'p1',
      resourceId: 'q1',
      studyId: 's1',
    });
    globalThis.fetch = routeFetch({
      'POST /chronicle/v3/survey/s1/participant/p1/questionnaire/q1': () => {
        if (typeof failure !== 'number') throw new TypeError('Failed to fetch');
        return Response.json({ message: 'Select one answer only.' }, { status: failure });
      },
      'GET /chronicle/v3/survey/s1/questionnaire/q1': () =>
        jsonResponse({ id: 'q1', questions: [{ choices: ['Daily', 'Never'], title: 'How often?' }], title: 'Habits' }),
    });
    const store = createApiStore();
    try {
      render(
        <Provider store={store}>
          <ParticipantQuestionnaireForm participantId="p1" questionnaireId="q1" studyId="s1" />
        </Provider>,
      );
      const answer = await screen.findByLabelText<HTMLInputElement>('Daily');
      fireEvent.click(answer);
      fireEvent.click(screen.getByRole('button', { name: 'Submit responses' }));
      expect(await screen.findByText(message)).toBeTruthy();
      expect(answer.checked).toBe(true);
    } finally {
      cleanup();
      restoreRequest();
    }
  });
});
