import { afterEach, describe, expect, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  PARTICIPANT_CONTEXT_STORAGE_KEY,
  PARTICIPANT_CSRF_STORAGE_KEY,
  storeParticipantSessionContext,
} from '@/lib/participant-access';
import { PARTICIPANT_KEEP_ALIVE_MS } from '@/lib/participant-access-guard';
import { studyOperationsApi } from '@/state/study-operations-api';
import { leaveIsBlocked } from '@/test/browser-env';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';

import { ParticipantQuestionnaireForm } from './participant-questionnaire-form';
import { ParticipantSurveyForm } from './participant-survey-form';

const savedFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  window.sessionStorage.removeItem(PARTICIPANT_CONTEXT_STORAGE_KEY);
  window.sessionStorage.removeItem(PARTICIPANT_CSRF_STORAGE_KEY);
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
});

describe('participant session keepalive', () => {
  test.each([401, 403])(
    'keeps answers through inactive access (%s) and offline checks, then clears the banner after recovery',
    async (status) => {
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
        value: routeFetch({
          'GET /chronicle/v3/survey/s1/questionnaire/q1': (request) => {
            expect(request.headers.get('X-Chronicle-Form-CSRF')).toBe('test-csrf');
            if (!questionnaireLoaded) {
              questionnaireLoaded = true;
              return Response.json({
                id: 'q1',
                questions: [{ choices: ['Daily', 'Never'], title: 'How often?' }],
                title: 'Habits',
              });
            }
            keepaliveCalls += 1;
            if (keepaliveCalls === 1) return new Response('', { status });
            if (keepaliveCalls === 2) throw new TypeError('offline');
            return new Response(null, { status: 204 });
          },
        }),
        writable: true,
      });

      const store = createApiStore();
      render(
        <Provider store={store}>
          <ParticipantQuestionnaireForm participantId="p1" questionnaireId="q1" studyId="s1" />
        </Provider>,
      );

      const daily = await screen.findByLabelText<HTMLInputElement>('Daily');
      fireEvent.click(daily);
      await screen.findByText('Participant access is no longer active');
      expect(screen.getByText(/Ask your study team to check your participation or provide a fresh link/)).toBeTruthy();
      expect(daily.checked).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
      await screen.findByText('Unable to confirm participant session');
      expect(daily.checked).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
      expect(daily.checked).toBe(true);
      expect(keepaliveCalls).toBe(3);
    },
  );

  // The pilot daily survey (APP_USAGE) keeps its own session alive every five minutes through the
  // app-usage route, and an offline, then refused, then restored session never loses the entered answer.
  test('the daily app-usage survey keeps its answer through offline and refused keepalives, then submits', async () => {
    window.location.href = 'http://localhost/';
    storeParticipantSessionContext({
      csrfToken: 'survey-csrf',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      formKind: 'APP_USAGE',
      participantId: 'p1',
      studyId: 's1',
    });
    const keepalives: string[] = [];
    const outcomes: (() => Response)[] = [
      () => Response.json({ appUsageFrequency: 'DAILY' }),
      () => {
        throw new TypeError('offline');
      },
      () => new Response('', { status: 403 }),
      () => Response.json({ appUsageFrequency: 'DAILY' }),
    ];
    const writes: { body: unknown; csrf: string | null }[] = [];
    const block = { start: '2026-06-01T00:00:00-04:00', end: '2026-06-02T00:00:00-04:00' };
    const restoreRequest = installRelativeRequest();
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: routeFetch({
        'GET /chronicle/v3/survey/s1/participant/p1/app-usage': () =>
          Response.json({
            apps: [{ appLabel: 'YouTube', appPackageName: 'com.google.android.youtube', blocks: [block] }],
            date: '2026-06-01',
            state: 'UNANSWERED',
            timeZone: 'America/Santiago',
          }),
        'GET /chronicle/v3/survey/s1/participant/p1/app-usage/days': () =>
          Response.json({ days: [], timeZone: 'America/Santiago', today: '2026-06-02' }),
        'GET /chronicle/v3/survey/s1/app-usage-frequency': (request) => {
          keepalives.push(request.headers.get('X-Chronicle-Form-CSRF') ?? '');
          const outcome = outcomes[keepalives.length - 1];
          if (!outcome) throw new Error('Unexpected extra keepalive');
          return outcome();
        },
        'POST /chronicle/v3/survey/s1/participant/p1/app-usage': async (request) => {
          writes.push({ body: await request.json(), csrf: request.headers.get('X-Chronicle-Form-CSRF') });
          return Response.json({});
        },
      }),
      writable: true,
    });
    // The keepalive interval is captured and fired by hand: the five-minute period is asserted, not waited for.
    const intervals: { delay: number | undefined; run: () => void }[] = [];
    const savedSetIntervalDescriptor = Object.getOwnPropertyDescriptor(window, 'setInterval');
    const savedSetInterval = window.setInterval.bind(window);
    window.setInterval = ((handler: () => void, delay?: number) => {
      intervals.push({ delay, run: handler });
      return savedSetInterval(() => undefined, 3_600_000);
    }) as typeof window.setInterval;
    const fiveMinutes = async () => {
      const keepAlive = intervals.filter(({ delay }) => delay === PARTICIPANT_KEEP_ALIVE_MS).at(-1);
      if (!keepAlive) throw new Error('No five-minute keepalive interval is running');
      await act(async () => {
        keepAlive.run();
        await Promise.resolve();
      });
    };
    const store = createApiStore();
    try {
      render(
        <Provider store={store}>
          <ParticipantSurveyForm date="2026-06-01" participantId="p1" studyId="s1" />
        </Provider>,
      );
      const child = () => screen.getByLabelText<HTMLInputElement>('Child alone');
      fireEvent.click(await screen.findByLabelText('Child alone'));
      await waitFor(() => expect(keepalives).toHaveLength(1));
      expect(PARTICIPANT_KEEP_ALIVE_MS).toBe(5 * 60_000);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(leaveIsBlocked()).toBe(true);

      await fiveMinutes();
      await screen.findByText('Unable to confirm participant session');
      await fiveMinutes();
      await screen.findByText('Participant access is no longer active');
      expect(child().checked).toBe(true);
      await fiveMinutes();
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
      expect(keepalives).toEqual(['survey-csrf', 'survey-csrf', 'survey-csrf', 'survey-csrf']);
      expect(child().checked).toBe(true);
      expect(leaveIsBlocked()).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Submit survey' }));
      await screen.findByText('Thank you');
      expect(writes).toEqual([
        {
          body: [{ appPackageName: 'com.google.android.youtube', blockStart: block.start, users: ['Child alone'] }],
          csrf: 'survey-csrf',
        },
      ]);
      await waitFor(() => expect(leaveIsBlocked()).toBe(false));
    } finally {
      cleanup();
      store.dispatch(studyOperationsApi.util.resetApiState());
      if (savedSetIntervalDescriptor) Object.defineProperty(window, 'setInterval', savedSetIntervalDescriptor);
      else Reflect.deleteProperty(window, 'setInterval');
      restoreRequest();
    }
  });
});
