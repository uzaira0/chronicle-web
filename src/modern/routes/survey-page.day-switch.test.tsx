import { afterEach, describe, expect, test } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { ParticipantAccessBootstrap } from '@/app/participant-access-bootstrap';
import type { AppUsageFrequency } from '@/generated/chronicle-contracts';
import { LanguageProvider, useTranslator } from '@/i18n';
import english from '@/i18n/en/translation.json';
import spanish from '@/i18n/es/translation.json';
import {
  PARTICIPANT_CONTEXT_STORAGE_KEY,
  PARTICIPANT_PUBLIC_API_BASE,
  participantAccessExchangeUrl,
  participantAccessSessionUrl,
  readParticipantSessionContext,
  storeParticipantSessionContext,
} from '@/lib/participant-access';
import { retainUnsavedEdits, UnsavedEditsGuard } from '@/lib/use-confirm-leave';
import { studyOperationsApi } from '@/state/study-operations-api';
import { leaveIsBlocked } from '@/test/browser-env';
import { routeFetch } from '@/test/http-fixtures';
import { ParticipantDashboardPage } from './participant-dashboard-page';
import { SurveyRoutePage } from './survey-page';

const savedFetch = globalThis.fetch;
const savedConfirmDescriptor = Object.getOwnPropertyDescriptor(window, 'confirm');

afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
  if (savedConfirmDescriptor) Object.defineProperty(window, 'confirm', savedConfirmDescriptor);
  else Reflect.deleteProperty(window, 'confirm');
  window.sessionStorage.clear();
  window.localStorage.clear();
  // `?lang=es` sets the module-level language that code outside React reads; put English back.
  render(<LanguageProvider initialSearch="?lang=en">{null}</LanguageProvider>);
  cleanup();
});

function answerConfirm(answer: boolean) {
  const prompts: string[] = [];
  window.confirm = (message?: string) => {
    prompts.push(String(message));
    return answer;
  };
  return prompts;
}

function day(date: string) {
  return {
    apps: [
      {
        appLabel: 'YouTube',
        appPackageName: 'com.google.android.youtube',
        blocks: [{ end: `${date}T11:00:00.000Z`, start: `${date}T10:00:00.000Z` }],
      },
    ],
    date,
    state: 'UNANSWERED',
    timeZone: 'UTC',
  };
}

// Real forms and router guard, served by the participant API.
function renderRoute(
  frequency: AppUsageFrequency,
  { withAccessBootstrap = false, readStatus = 200, initialSearch = '' } = {},
) {
  const submissions: { answers: unknown; date: string }[] = [];
  const reads: string[] = [];
  const exchanges: unknown[] = [];
  const studyPath = `${PARTICIPANT_PUBLIC_API_BASE}/survey/${STORED_SESSION.studyId}`;
  const appUsagePath = `${studyPath}/participant/${STORED_SESSION.participantId}/app-usage`;
  const appUsage = async (request: Request) => {
    const date = new URL(request.url).searchParams.get('date') ?? '';
    if (request.method === 'POST') {
      submissions.push({ answers: await request.json(), date });
      return Response.json(null);
    }
    return Response.json(day(date));
  };
  const session = () => Response.json(readParticipantSessionContext());
  const fetchFixture = routeFetch({
    [`GET ${studyPath}/app-usage-frequency`]: () => Response.json({ appUsageFrequency: frequency }),
    [`GET ${appUsagePath}/days`]: () =>
      Response.json({
        days: ['2026-06-01', '2026-06-02'].map((date) => ({
          date,
          state: submissions.some((submission) => submission.date === date) ? 'ANSWERED' : 'UNANSWERED',
        })),
        timeZone: 'UTC',
        today: '2026-06-03',
      }),
    [`GET ${appUsagePath}`]: appUsage,
    [`POST ${appUsagePath}`]: appUsage,
    [`GET ${participantAccessSessionUrl()}`]: session,
    [`POST ${participantAccessExchangeUrl()}`]: async (request) => {
      exchanges.push(await request.json());
      return session();
    },
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.method === 'GET') reads.push(new URL(request.url).pathname);
      return readStatus === 200
        ? fetchFixture(request)
        : Promise.resolve(Response.json({ message: 'Unauthorized' }, { status: readStatus }));
    },
    writable: true,
  });
  window.location.href = 'http://localhost/';
  const store = configureStore({
    middleware: (getDefault) => getDefault().concat(studyOperationsApi.middleware),
    reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
  });
  const router = createMemoryRouter(
    [
      {
        children: [
          {
            element: withAccessBootstrap ? (
              <ParticipantAccessBootstrap>
                <SurveyRoutePage />
              </ParticipantAccessBootstrap>
            ) : (
              <SurveyRoutePage />
            ),
            path: '/survey',
          },
          { element: <p>Other page</p>, path: '/other' },
        ],
        element: (
          <>
            <UnsavedEditsGuard />
            <Outlet />
          </>
        ),
      },
    ],
    { initialEntries: ['/survey?studyId=s1&participantId=p1'] },
  );
  render(
    <Provider store={store}>
      <LanguageProvider initialSearch={initialSearch}>
        <RouterProvider router={router} />
      </LanguageProvider>
    </Provider>,
  );
  return { router, submissions, reads, exchanges };
}

// A participant who already exchanged their link; the server alone decides whether it is still valid.
const STORED_SESSION = {
  csrfToken: 'csrf',
  expiresAt: '2099-01-01T00:00:00Z',
  formKind: 'APP_USAGE',
  participantId: 'p1',
  studyId: 's1',
} as const;

const openDay = () => screen.getByRole('button', { name: 'Jun 1, 2026: Not answered' });
const otherDay = () => screen.getByRole('button', { name: 'Jun 2, 2026: Not answered' });

describe.each(['DAILY', 'HOURLY'] as const)('%s survey day switches', (frequency) => {
  async function answerInput() {
    if (frequency === 'HOURLY' && !screen.queryByLabelText('YouTube')) {
      fireEvent.click(await screen.findByRole('button', { name: 'Begin survey' }));
    }
    return screen.findByLabelText<HTMLInputElement>(frequency === 'DAILY' ? 'Child alone' : 'YouTube');
  }

  test('declining keeps the open day and its answer', async () => {
    const prompts = answerConfirm(false);
    renderRoute(frequency);
    fireEvent.click(await answerInput());
    fireEvent.click(otherDay());

    expect(prompts).toEqual(['You have unsaved changes. Leave this page and discard them?']);
    expect(openDay().getAttribute('aria-pressed')).toBe('true');
    expect((await answerInput()).checked).toBe(true);
    expect(leaveIsBlocked()).toBe(true);
  });

  test('accepting opens an empty day and releases retained edits before router navigation', async () => {
    const prompts = answerConfirm(true);
    const { router } = renderRoute(frequency);
    fireEvent.click(await answerInput());
    const release = retainUnsavedEdits();
    try {
      fireEvent.click(otherDay());

      expect(prompts).toHaveLength(1);
      await waitFor(() => expect(otherDay().getAttribute('aria-pressed')).toBe('true'));
      expect((await answerInput()).checked).toBe(false);
      expect(leaveIsBlocked()).toBe(false);
      await act(() => router.navigate('/other'));
      await screen.findByText('Other page');
      expect(prompts).toHaveLength(1);
    } finally {
      release();
    }
  });

  test('answers on the new day still block the router after accepting a day switch', async () => {
    answerConfirm(true);
    const { router } = renderRoute(frequency);
    fireEvent.click(await answerInput());
    fireEvent.click(otherDay());
    fireEvent.click(await answerInput());
    const prompts = answerConfirm(false);

    await act(() => router.navigate('/other'));

    await waitFor(() => expect(prompts).toHaveLength(1));
    expect(router.state.location.pathname).toBe('/survey');
    expect(otherDay().getAttribute('aria-pressed')).toBe('true');
    expect((await answerInput()).checked).toBe(true);
  });

  test('without unsubmitted answers the day changes without asking', async () => {
    const prompts = answerConfirm(false);
    renderRoute(frequency);
    await answerInput();
    fireEvent.click(openDay());
    fireEvent.click(otherDay());

    expect(prompts).toHaveLength(0);
    await waitFor(() => expect(otherDay().getAttribute('aria-pressed')).toBe('true'));
  });

  test('selecting the open day does not ask', async () => {
    const prompts = answerConfirm(false);
    renderRoute(frequency);
    fireEvent.click(await answerInput());
    fireEvent.click(openDay());

    expect(prompts).toHaveLength(0);
    expect((await answerInput()).checked).toBe(true);
  });

  test('submitting refreshes the calendar without prompting or changing the open day', async () => {
    const prompts = answerConfirm(false);
    const { submissions } = renderRoute(frequency);
    fireEvent.click(await answerInput());
    if (frequency === 'HOURLY') fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit survey' }));

    const answeredDay = await screen.findByRole('button', { name: 'Jun 1, 2026: Answered' });
    expect(answeredDay.getAttribute('aria-pressed')).toBe('true');
    expect(submissions).toEqual([
      {
        answers: [
          {
            appPackageName: 'com.google.android.youtube',
            blockStart: '2026-06-01T10:00:00.000Z',
            users: [frequency === 'DAILY' ? 'Child alone' : 'Target Child'],
          },
        ],
        date: '2026-06-01',
      },
    ]);
    expect(leaveIsBlocked()).toBe(false);
    fireEvent.click(otherDay());
    await answerInput();
    expect(otherDay().getAttribute('aria-pressed')).toBe('true');
    expect(prompts).toHaveLength(0);
  });
});

describe.each(['DAILY', 'HOURLY'] as const)('%s survey language switch', (frequency) => {
  test('keeps the picked day and its unsent answer under the access bootstrap', async () => {
    answerConfirm(true);
    storeParticipantSessionContext(STORED_SESSION);
    renderRoute(frequency, { withAccessBootstrap: true });
    await screen.findByRole('button', { name: 'Jun 1, 2026: Not answered' });
    const calendarDays = () => screen.getAllByRole('button').filter((button) => button.hasAttribute('aria-pressed'));
    const picked = calendarDays().indexOf(otherDay());
    fireEvent.click(otherDay());
    if (frequency === 'HOURLY') fireEvent.click(await screen.findByRole('button', { name: 'Begin survey' }));
    fireEvent.click(await screen.findByLabelText(frequency === 'DAILY' ? 'Child alone' : 'YouTube'));

    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: window.localStorage }));
      await Promise.resolve();
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'es' } });

    expect(await screen.findAllByText(spanish.app_usage_survey.title)).not.toHaveLength(0);
    expect(calendarDays().findIndex((button) => button.getAttribute('aria-pressed') === 'true')).toBe(picked);
    expect(document.querySelectorAll('input:checked')).toHaveLength(1);
  });
});

test('a stored session the server expired explains how to get a fresh link instead of a bare retry', async () => {
  storeParticipantSessionContext(STORED_SESSION);
  renderRoute('DAILY', { withAccessBootstrap: true, readStatus: 401, initialSearch: '?lang=es' });
  expect(await screen.findByText(spanish.participant_session.expired_description)).toBeTruthy();
  expect(screen.getByRole('button', { name: spanish.common.try_again })).toBeTruthy();
});

test.each(['store', 'storage event'])(
  'replacing stored access via %s re-establishes the mounted bootstrap',
  async (source) => {
    storeParticipantSessionContext(STORED_SESSION);
    renderRoute('DAILY', { withAccessBootstrap: true });
    await screen.findByRole('button', { name: 'Jun 1, 2026: Not answered' });
    await act(async () => {
      const context = { ...STORED_SESSION, participantId: 'someone-else' };
      if (source === 'store') storeParticipantSessionContext(context);
      else {
        window.sessionStorage.setItem(PARTICIPANT_CONTEXT_STORAGE_KEY, JSON.stringify(context));
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: PARTICIPANT_CONTEXT_STORAGE_KEY,
            storageArea: window.sessionStorage,
          }),
        );
      }
      await Promise.resolve();
    });
    expect(await screen.findByText(english.participant_access.link_mismatch)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Jun 1, 2026: Not answered' })).toBeNull();
  },
);

test('a non-authentication read failure keeps Retry and repeats the failed reads', async () => {
  storeParticipantSessionContext(STORED_SESSION);
  const { reads } = renderRoute('DAILY', { withAccessBootstrap: true, readStatus: 503 });
  const retry = await screen.findByRole('button', { name: 'Try again' });
  expect(screen.queryByText(spanish.participant_session.expired_description)).toBeNull();
  const before = reads.length;
  fireEvent.click(retry);
  await waitFor(() => expect(reads.length).toBe(before + 2));
  expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
});

function DashboardLanguageSwitch() {
  const { setLanguage } = useTranslator();
  return (
    <button type="button" onClick={() => setLanguage('es')}>
      Switch language
    </button>
  );
}

test('dashboard history errors translate without repeating I/O on a language change', async () => {
  let requests = 0;
  globalThis.fetch = (() => {
    requests++;
    return Promise.resolve(Response.json({}, { status: 503 }));
  }) as unknown as typeof fetch;
  render(
    <LanguageProvider initialSearch="?lang=en">
      <RouterProvider
        router={createMemoryRouter(
          [
            {
              path: '/participant',
              element: (
                <>
                  <DashboardLanguageSwitch />
                  <ParticipantDashboardPage />
                </>
              ),
            },
          ],
          { initialEntries: ['/participant?studyId=s1&participantId=p1'] },
        )}
      />
    </LanguageProvider>,
  );
  await screen.findByRole('alert');
  expect(requests).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Switch language' }));
  await act(async () => {});
  expect(requests).toBe(1);
  expect(screen.getByRole('alert').textContent).toBe(
    spanish.participant_dashboard.history_error_status.replace('{{status}}', '503'),
  );
});

test.each(['?studyId=s2&participantId=p1', '?studyId=s1&participantId=p2'])(
  'bootstrap rechecks a changed access scope %s',
  async (search) => {
    storeParticipantSessionContext(STORED_SESSION);
    const { router, reads } = renderRoute('DAILY', { withAccessBootstrap: true });
    await screen.findByRole('button', { name: 'Jun 1, 2026: Not answered' });
    await act(() => router.navigate(`/survey${search}`));
    expect(await screen.findByText(english.participant_access.link_mismatch)).toBeTruthy();
    expect(reads).toContain('/chronicle/v3/participant-access/session');
  },
);

test('new access codes exchange again while a later stored context supersedes the consumed code', async () => {
  storeParticipantSessionContext(STORED_SESSION);
  const { router, exchanges } = renderRoute('DAILY', { withAccessBootstrap: true });
  await screen.findByRole('button', { name: 'Jun 1, 2026: Not answered' });
  for (const accessCode of ['bootstrap-input-first', 'bootstrap-input-second']) {
    await act(() => router.navigate(`/survey?studyId=s1&participantId=p1#accessCode=${accessCode}`));
    await screen.findByRole('button', { name: 'Jun 1, 2026: Not answered' });
  }
  expect(exchanges).toEqual([
    expect.objectContaining({ accessCode: 'bootstrap-input-first' }),
    expect.objectContaining({ accessCode: 'bootstrap-input-second' }),
  ]);
  await act(async () => {
    storeParticipantSessionContext({ ...STORED_SESSION, csrfToken: 'replacement-csrf' });
    await Promise.resolve();
  });
  await screen.findByRole('button', { name: 'Jun 1, 2026: Not answered' });
  expect(readParticipantSessionContext()?.csrfToken).toBe('replacement-csrf');
  expect(exchanges).toHaveLength(2);
});
