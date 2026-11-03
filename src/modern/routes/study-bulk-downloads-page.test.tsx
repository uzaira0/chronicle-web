import { afterEach, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const STUDY_TIME_ZONE = 'America/Santiago';
type TudArg = { dataType: string; startDate: string; endDate: string; studyId: string };
let tudCalls: TudArg[] = [];

afterEach(() => {
  cleanup();
  tudCalls = [];
});

const studyOperationsApiModule = await import('@/state/study-operations-api');

await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useGetStudyExportAvailabilityQuery: () => ({ currentData: { dataTypes: [], timeUseDiary: true } }),
  useDownloadStudyTudDataMutation: () => [
    (arg: TudArg) => {
      tudCalls.push(arg);
      return { unwrap: () => Promise.resolve(null) };
    },
    { isLoading: false },
  ],
  useDownloadQuestionnaireResponsesMutation: () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }],
  useGetStudyQuestionnairesQuery: () => ({ data: [], isError: false, isLoading: false }),
  useGetStudySummaryQuery: () => ({
    currentData: {
      id: 'study-1',
      modules: { CHRONICLE_DATA_COLLECTION: {} },
      title: 'Export Study',
      settings: { TimeUseDiary: { timeZone: STUDY_TIME_ZONE } },
    },
    error: undefined,
    isError: false,
    isLoading: false,
  }),
}));

const { StudyBulkDownloadsPage } = await import('./study-bulk-downloads-page');

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/studies/study-1/downloads']}>
      <Routes>
        <Route element={<StudyBulkDownloadsPage />} path="/studies/:studyId/downloads" />
      </Routes>
    </MemoryRouter>,
  );
}

test('offers no server-side export job and points collection data to the participants page', () => {
  renderPage();
  expect(screen.queryByRole('button', { name: /Start export/i })).toBeNull();
  expect(screen.queryByText(/Recent export jobs/)).toBeNull();
  expect(screen.getByText(/Participants page/)).toBeTruthy();
});

test('Time use diary days are study-zone days across the September clock change, and the page says so', async () => {
  const { container } = renderPage();
  expect(screen.getByText(/study time zone, America\/Santiago/)).toBeTruthy();
  fireEvent.change(container.querySelector('#tud-start') as HTMLElement, { target: { value: '2026-09-06' } });
  fireEvent.change(container.querySelector('#tud-end') as HTMLElement, { target: { value: '2026-09-06' } });
  act(() => screen.getByRole('button', { name: 'DayTime' }).click());
  await waitFor(() => expect(tudCalls).toHaveLength(1));
  // Santiago skips 2026-09-06 00:00; the day starts at 01:00 -03:00 and ends at the next midnight.
  expect(tudCalls[0]).toMatchObject({
    dataType: 'DayTime',
    endDate: '2026-09-07T00:00:00.000-03:00',
    startDate: '2026-09-06T01:00:00.000-03:00',
    studyId: 'study-1',
  });
});
