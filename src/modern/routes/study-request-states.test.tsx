import { afterEach, expect, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { formatDisplayDate } from '@/lib/format';
import { studyOperationsApi } from '@/state/study-operations-api';
import type { FetchRoutes } from '@/test/http-fixtures';
import { routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';
import { StudyDetailsPage } from './study-details-page';
import { StudyQuestionnairesPage } from './study-questionnaires-page';
import { StudySettingsAuditPage } from './study-settings-audit-page';

const originalFetch = globalThis.fetch;
const STUDY_ID = 'request-state-study';
const STUDY_PATH = `/chronicle/api/web/study/${STUDY_ID}`;
const QUESTIONNAIRES_PATH = `/chronicle/api/web/survey/${STUDY_ID}/questionnaire`;
const LIMITS_PATH = `/chronicle/api/web/limits/study/${STUDY_ID}`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderPage(page: ReactNode, responses: FetchRoutes) {
  window.location.href = 'http://localhost/';
  globalThis.fetch = routeFetch({
    [`GET ${STUDY_PATH}`]: () =>
      json({ id: STUDY_ID, title: 'Current Study', modules: { CHRONICLE_DATA_COLLECTION: {} } }),
    [`GET ${STUDY_PATH}/participants`]: () => json([]),
    [`GET ${STUDY_PATH}/settings/type/DataCollection`]: () => json({ modules: {} }),
    [`GET ${STUDY_PATH}/settings/audit`]: () => json([]),
    [`GET ${STUDY_PATH}/settings/acknowledgments`]: () => json([]),
    [`GET ${QUESTIONNAIRES_PATH}`]: () => json([]),
    [`GET ${LIMITS_PATH}`]: () => json({ studyDuration: null, studyEnds: null }),
    ...responses,
  });
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
    [`GET ${QUESTIONNAIRES_PATH}`]: () => json(questionnaires),
    [`DELETE ${QUESTIONNAIRES_PATH}/q0`]: () => json({}, status),
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

test('sensor overview uses current per-module sensor policy', async () => {
  renderPage(<StudyDetailsPage />, {
    [`GET ${STUDY_PATH}`]: () =>
      json({
        id: STUDY_ID,
        title: 'Current Study',
        modules: { CHRONICLE_DATA_COLLECTION: {} },
      }),
    [`GET ${STUDY_PATH}/settings/type/DataCollection`]: () =>
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

test.each([
  ['2027-03-03T00:00:00Z', formatDisplayDate('2027-03-03T00:00:00Z')],
  [null, 'Open-ended'],
])(
  'the timeline shows the end the server enforces (%s), not the unenforced study endedAt',
  async (studyEnds, shown) => {
    renderPage(<StudyDetailsPage />, {
      [`GET ${STUDY_PATH}`]: () => json({ id: STUDY_ID, title: 'Current Study', endedAt: '2030-01-01T00:00:00Z' }),
      [`GET ${LIMITS_PATH}`]: () => json({ studyEnds }),
    });
    expect(await screen.findByText(shown)).toBeTruthy();
    expect(screen.queryByText(formatDisplayDate('2030-01-01T00:00:00Z'))).toBeNull();
  },
);

test('a failed limits refresh withdraws the cached Open-ended claim and offers a retry', async () => {
  let limits: () => Response = () => json({});
  const store = renderPage(<StudyDetailsPage />, { [`GET ${LIMITS_PATH}`]: () => limits() });
  expect(await screen.findByText('Open-ended')).toBeTruthy();
  // Another tab set an end; this tab's focus refetch (study layout) then fails.
  const studyEnds = '2027-03-03T00:00:00Z';
  limits = () => json({}, 503);
  await act(async () => {
    const refetch = store.dispatch(
      studyOperationsApi.endpoints.getStudyLimits.initiate(STUDY_ID, { forceRefetch: true }),
    );
    await refetch;
    refetch.unsubscribe();
  });
  await waitFor(() => expect(screen.queryByText('Open-ended')).toBeNull());
  limits = () => json({ studyEnds });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText(formatDisplayDate(studyEnds))).toBeTruthy();
});

test('failed consent history shows retry instead of an absent-consent claim', async () => {
  renderPage(<StudySettingsAuditPage />, {
    [`GET ${STUDY_PATH}/settings/acknowledgments`]: () => json({}, 503),
  });
  expect(await screen.findByText(/Consent records could not be loaded/)).toBeTruthy();
  expect(screen.queryByText('No participant consent decisions recorded for this study.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});
