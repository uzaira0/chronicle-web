import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';
import { QueryStatus } from '@reduxjs/toolkit/query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ModernRouter } from '@/app/router';
import { LanguageProvider } from '@/i18n';
import { OverviewPage } from '@/routes/overview-page';
import { StudiesPage } from '@/routes/studies-page';
import { StudyBulkDownloadsPage } from '@/routes/study-bulk-downloads-page';
import { StudyCompliancePage } from '@/routes/study-compliance-page';
import { StudyDetailsPage } from '@/routes/study-details-page';
import { StudyLayout } from '@/routes/study-layout';
import { StudyParticipantsPage } from '@/routes/study-participants-page';
import { StudyQuestionnairesPage } from '@/routes/study-questionnaires-page';
import { StudySettingsAuditPage } from '@/routes/study-settings-audit-page';
import { StudyTimeUseDiaryPage } from '@/routes/study-time-use-diary-page';
import { SESSION_STATUS, sessionReducer } from '@/state/session-slice';
import { studyOperationsApi } from '@/state/study-operations-api';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { StatePanel } from './state-panel';

const originalFetch = globalThis.fetch;
let restoreRequest: () => void;
const studyPath = '/chronicle/api/web/study/recovery';
const study = { id: 'recovery', title: 'Recovered study', modules: {}, settings: {} };
const participants = [
  {
    candidate: { id: 'c1' },
    participantId: 'Recovered participant',
    participantTags: [],
    participationStatus: 'ENROLLED',
  },
];

beforeEach(() => {
  restoreRequest = installRelativeRequest();
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  restoreRequest();
});

function renderPage(Page: ComponentType, useAppRouter = false) {
  const store = configureStore({
    reducer: { session: sessionReducer, [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
    preloadedState: {
      session: { ...sessionReducer(undefined, { type: 'init' }), status: SESSION_STATUS.authenticated },
    },
    middleware: (getDefault) => getDefault().concat(studyOperationsApi.middleware),
  });
  render(
    <Provider store={store}>
      <LanguageProvider initialSearch="">
        {useAppRouter ? (
          <ModernRouter />
        ) : (
          <MemoryRouter initialEntries={['/studies/recovery']}>
            <Routes>
              <Route path="/studies/:studyId" element={<Page />} />
            </Routes>
          </MemoryRouter>
        )}
      </LanguageProvider>
    </Provider>,
  );
  return store;
}

describe('query error recovery', () => {
  test.each([
    {
      name: 'studies catalog',
      Page: StudiesPage,
      path: '/chronicle/api/web/study',
      body: [study],
      recovered: () => expect(screen.getByRole('link', { name: /Recovered study/ })).toBeTruthy(),
    },
    {
      name: 'dashboard studies',
      Page: OverviewPage,
      path: '/chronicle/api/web/study',
      body: [study],
      recovered: () => expect(screen.getByRole('link', { name: /Recovered study/ })).toBeTruthy(),
    },
    {
      name: 'study layout',
      Page: StudyLayout,
      path: studyPath,
      body: study,
      recovered: () => expect(screen.getByRole('heading', { name: /Recovered study/ })).toBeTruthy(),
    },
    {
      name: 'questionnaires',
      Page: StudyQuestionnairesPage,
      path: '/chronicle/api/web/survey/recovery/questionnaire',
      body: [{ id: 'q1', title: 'Recovered questionnaire', questions: [], active: true }],
      recovered: () => expect(screen.getByText('Recovered questionnaire')).toBeTruthy(),
    },
    {
      name: 'participants',
      Page: StudyParticipantsPage,
      path: `${studyPath}/participants`,
      body: participants,
      recovered: () => expect(screen.getByText('Recovered participant')).toBeTruthy(),
    },
    {
      name: 'overview participant counts',
      Page: StudyDetailsPage,
      path: `${studyPath}/participants`,
      body: participants,
      recovered: () => expect(screen.getByText('Total participants').nextElementSibling?.textContent).toBe('1'),
    },
    {
      name: 'settings audit',
      Page: StudySettingsAuditPage,
      path: `${studyPath}/settings/audit`,
      body: [
        {
          id: 'a1',
          changedAt: '2026-10-06T12:00:00Z',
          changedBy: 'Recovered researcher',
          settingKey: 'DataCollection',
          changeSummary: 'Recovered change',
        },
      ],
      recovered: () => expect(screen.getByText('Recovered change')).toBeTruthy(),
    },
    {
      name: 'download availability',
      Page: StudyBulkDownloadsPage,
      path: `${studyPath}/export/availability`,
      body: { dataTypes: [], timeUseDiary: true },
      recovered: () => expect(screen.getByRole('button', { name: 'DayTime' })).toBeTruthy(),
    },
    {
      name: 'download study details',
      Page: StudyBulkDownloadsPage,
      path: studyPath,
      body: study,
      recovered: () => expect(screen.getByRole('heading', { name: /Recovered study/ })).toBeTruthy(),
    },
  ])('$name retries a failed request and displays the recovered response', async ({ Page, path, body, recovered }) => {
    let calls = 0;
    let resolveRetry: ((response: Response) => void) | undefined;
    globalThis.fetch = routeFetch({
      [`GET ${studyPath}`]: () => Response.json(study),
      [`GET ${studyPath}/lifecycle`]: () => Response.json('ACTIVE'),
      'GET /chronicle/api/web/limits/study/recovery': () => Response.json(null),
      [`GET ${studyPath}/settings/type/DataCollection`]: () => Response.json({ modules: {} }),
      [`GET ${studyPath}/participants/stats`]: () => Response.json({}),
      [`GET ${studyPath}/participants`]: () => Response.json(participants),
      [`GET ${studyPath}/pending-enrollments`]: () => Response.json([]),
      [`GET ${studyPath}/settings/audit`]: () => Response.json([]),
      [`GET ${studyPath}/settings/acknowledgments`]: () => Response.json([]),
      [`GET ${studyPath}/export/availability`]: () => Response.json({ dataTypes: [], timeUseDiary: false }),
      [`GET ${studyPath}/deletions`]: () => Response.json([]),
      'GET /chronicle/api/web/survey/recovery/questionnaire': () => Response.json([]),
      [`GET ${path}`]: () => {
        calls++;
        if (calls === 1) return Response.json({}, { status: 503 });
        return new Promise<Response>((resolve) => {
          resolveRetry = resolve;
        });
      },
    });
    const store = renderPage(Page);
    try {
      const retry = await screen.findByRole<HTMLButtonElement>('button', { name: 'Try again' });
      expect(calls).toBe(1);
      expect(retry.disabled).toBe(false);
      fireEvent.click(retry);
      await waitFor(() => expect(calls).toBe(2));
      expect(resolveRetry).toBeDefined();
      expect(
        Object.values(store.getState().studyOperationsApi.queries).some(
          (query) => query?.status === QueryStatus.pending,
        ),
      ).toBe(true);
      await act(async () => {
        resolveRetry?.(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));
        await Promise.resolve();
      });
      await waitFor(recovered);
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    } finally {
      cleanup();
      store.dispatch(studyOperationsApi.util.resetApiState());
    }
  });

  test('StatePanel disables a busy retry and enables it when the request settles', () => {
    const retry = mock(() => undefined);
    const panel = (isRetrying: boolean) => (
      <LanguageProvider initialSearch="">
        <StatePanel
          description="The request failed."
          icon={<span />}
          isRetrying={isRetrying}
          onRetry={retry}
          title="Failed to load"
          tone="destructive"
        />
      </LanguageProvider>
    );
    const view = render(panel(true));
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Try again' });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(retry).not.toHaveBeenCalled();
    view.rerender(panel(false));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('route loading and empty catalog actions', () => {
  test('diary submissions search announces a busy skeleton after the study loads', async () => {
    globalThis.fetch = routeFetch({
      [`GET ${studyPath}`]: () => Response.json(study),
      'GET /chronicle/api/web/time-use-diary/recovery/ids': () => new Promise<Response>(() => undefined),
    });
    const store = renderPage(StudyTimeUseDiaryPage);
    try {
      fireEvent.click(await screen.findByRole('button', { name: 'Search' }));
      const region = await screen.findByRole('status', { name: 'Fetching time use diary submissions…', busy: true });
      expect(region.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
      expect(region.querySelector('.animate-spin')).toBeNull();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Searching…' }).disabled).toBe(true);
    } finally {
      cleanup();
      store.dispatch(studyOperationsApi.util.resetApiState());
    }
  });

  test.each([
    { name: 'participants', Page: StudyParticipantsPage },
    { name: 'compliance', Page: StudyCompliancePage },
    { name: 'settings audit', Page: StudySettingsAuditPage },
    { name: 'questionnaires', Page: StudyQuestionnairesPage },
    { name: 'downloads', Page: StudyBulkDownloadsPage },
    { name: 'study layout', Page: StudyLayout },
    { name: 'diary study zone', Page: StudyTimeUseDiaryPage },
  ])('$name announces a busy skeleton while the request is pending', async ({ Page }) => {
    const pending = () => new Promise<Response>(() => undefined);
    globalThis.fetch = routeFetch(
      Object.fromEntries(
        [
          studyPath,
          `${studyPath}/lifecycle`,
          '/chronicle/api/web/limits/study/recovery',
          `${studyPath}/participants`,
          `${studyPath}/participants/stats`,
          `${studyPath}/pending-enrollments`,
          `${studyPath}/settings/audit`,
          `${studyPath}/settings/acknowledgments`,
          `${studyPath}/settings/type/DataCollection`,
          '/chronicle/api/web/survey/recovery/questionnaire',
          '/chronicle/api/web/compliance/study/recovery',
          '/chronicle/api/web/time-use-diary/recovery/ids',
        ].map((path) => [`GET ${path}`, pending]),
      ),
    );
    const store = renderPage(Page);
    try {
      const regions = await screen.findAllByRole('status', { busy: true });
      for (const region of regions) {
        expect(region.getAttribute('aria-label')).toBeTruthy();
        expect(region.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
        expect(region.querySelector('.animate-spin')).toBeNull();
      }
    } finally {
      cleanup();
      store.dispatch(studyOperationsApi.util.resetApiState());
    }
  });

  test.each([OverviewPage, StudiesPage])('an empty catalog offers the next action on %p', async (Page) => {
    globalThis.fetch = routeFetch({ 'GET /chronicle/api/web/study': () => Response.json([]) });
    const store = renderPage(Page);
    try {
      if (Page === OverviewPage) {
        const empty = await screen.findByText('No studies found.');
        expect(empty.parentElement?.querySelector('a')?.getAttribute('href')).toBe('/studies');
      } else {
        await screen.findByText('No studies found');
        fireEvent.click(screen.getAllByRole('button', { name: 'Create new study' }).at(-1) as HTMLButtonElement);
        expect(await screen.findByRole('dialog')).toBeTruthy();
      }
    } finally {
      cleanup();
      store.dispatch(studyOperationsApi.util.resetApiState());
    }
  });

  test('the app router keeps a loading region visible until the study arrives', async () => {
    window.location.href = 'http://localhost/studies/recovery';
    const pending = () => new Promise<Response>(() => undefined);
    globalThis.fetch = routeFetch({
      [`GET ${studyPath}`]: pending,
      [`GET ${studyPath}/lifecycle`]: pending,
      'GET /chronicle/api/web/limits/study/recovery': pending,
    });
    const store = renderPage(StudyLayout, true);
    try {
      expect(await screen.findByRole('status', { busy: true })).toBeTruthy();
    } finally {
      cleanup();
      store.dispatch(studyOperationsApi.util.resetApiState());
    }
  });
});
