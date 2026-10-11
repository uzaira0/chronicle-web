import { afterEach, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { studyOperationsApi } from '@/state/study-operations-api';
import { createApiStore } from '@/test/study-operations-store';

const apiModule = await import('@/state/study-operations-api');
const realHooks = Object.fromEntries(Object.entries(studyOperationsApi).filter(([key]) => key.startsWith('use')));
await mock.module('@/state/study-operations-api', () => ({ ...apiModule, ...realHooks }));
const { StudyDetailsPage } = await import('./study-details-page');
const { StudyQuestionnairesPage } = await import('./study-questionnaires-page');
const { StudySettingsAuditPage } = await import('./study-settings-audit-page');
const { StudyBulkDownloadsPage } = await import('./study-bulk-downloads-page');

const originalFetch = globalThis.fetch;
const STUDY_ID = 'request-state-study';
const STUDY_PATH = `/chronicle/api/web/study/${STUDY_ID}`;
const QUESTIONNAIRES_PATH = `/chronicle/api/web/survey/${STUDY_ID}/questionnaire`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderPage(page: ReactNode, responses: Record<string, (request: Request) => Response>) {
  window.location.href = 'http://localhost/';
  globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    return Promise.resolve(
      responses[path]?.(request) ??
        json(
          path === STUDY_PATH
            ? { id: STUDY_ID, title: 'Current Study', modules: { CHRONICLE_DATA_COLLECTION: {} } }
            : [],
        ),
    );
  }) as unknown as typeof fetch;
  const store = createApiStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/studies/${STUDY_ID}`]}>
        <Routes>
          <Route path="/studies/:studyId" element={page} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

test.each([200, 503])('a new questionnaire deletion resets the previous mutation after status %i', async (status) => {
  const questionnaires = ['First', 'Second'].map((title, index) => ({
    id: `q${index}`,
    title,
    active: true,
    description: '',
    questions: [],
  }));
  renderPage(<StudyQuestionnairesPage />, {
    [QUESTIONNAIRES_PATH]: () => json(questionnaires),
    [`${QUESTIONNAIRES_PATH}/q0`]: () => json({}, status),
  });
  await screen.findByText('First');
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete questionnaire' })[1] as HTMLButtonElement);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
  if (status === 503) {
    await within(screen.getByRole('dialog')).findByText(/Failed to delete questionnaire/);
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Close', { selector: 'button' }));
  } else await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete questionnaire' })[0] as HTMLButtonElement);
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' })).toBeTruthy();
  expect(screen.getByRole('dialog').textContent).toContain('Second');
});

test('sensor overview uses current DataCollection policy instead of conflicting legacy settings', async () => {
  renderPage(<StudyDetailsPage />, {
    [STUDY_PATH]: () =>
      json({
        id: STUDY_ID,
        title: 'Current Study',
        modules: { ANDROID_SENSOR: {} },
        settings: { AndroidSensor: { samplingRateHz: 5, enabled: true } },
      }),
    [`${STUDY_PATH}/settings/type/DataCollection`]: () =>
      json({
        modules: {
          sensor_accelerometer: { enabled: true, sensorPolicy: { samplingRateHz: 40 } },
          sensor_gyroscope: { enabled: false, sensorPolicy: { samplingRateHz: 50 } },
        },
      }),
  });
  expect(await screen.findByText('40 Hz')).toBeTruthy();
  expect(screen.queryByText('5 Hz')).toBeNull();
  expect(screen.queryByText('50 Hz')).toBeNull();
  expect(screen.getAllByText('Gyroscope').some((node) => node.classList.contains('bg-muted'))).toBe(true);
});

test('failed consent history shows retry instead of an absent-consent claim', async () => {
  renderPage(<StudySettingsAuditPage />, {
    [`${STUDY_PATH}/settings/acknowledgments`]: () => json({}, 503),
  });
  expect(await screen.findByText(/Consent records could not be loaded/)).toBeTruthy();
  expect(screen.queryByText('No participant consent decisions recorded for this study.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});

test('active exports become downloadable without manual refresh and stop polling when complete', async () => {
  let polls = 0;
  const job = {
    rowCount: 12,
    studyId: STUDY_ID,
    exportId: 'export-ready',
    format: 'EXCEL',
    createdAt: '2026-10-07T12:00:00Z',
  };
  const store = renderPage(<StudyBulkDownloadsPage />, {
    [`${STUDY_PATH}/settings/type/DataCollection`]: () => json({ modules: {} }),
    [`${STUDY_PATH}/export`]: () => json([{ ...job, status: ++polls === 1 ? 'PENDING' : 'COMPLETED' }]),
  });
  await screen.findByText('Pending');
  store.dispatch(studyOperationsApi.internalActions.onFocusLost());
  await new Promise((resolve) => setTimeout(resolve, 5_500));
  expect(polls).toBe(1);
  store.dispatch(studyOperationsApi.internalActions.onFocus());
  expect(await screen.findByRole('button', { name: 'Download' }, { timeout: 6_000 })).toBeTruthy();
  const completedPolls = polls;
  await new Promise((resolve) => setTimeout(resolve, 5_500));
  expect(polls).toBe(completedPolls);
}, 20_000);
