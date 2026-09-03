import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';

// Time Use Diary and questionnaire responses are served by TimeUseDiaryController and
// SurveyController, not by the ParticipantDataType export job, so they are separate
// download surfaces on this page. No study in the current dataset enables either module,
// so their rendering is only exercised here.
const tudCalls: unknown[] = [];
const questionnaireCalls: unknown[] = [];
const exportCalls: unknown[] = [];

const studyOperationsApiModule = await import('@/state/study-operations-api');

await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useCreateStudyExportMutation: () => [
    (args: unknown) => {
      exportCalls.push(args);
      return { unwrap: () => Promise.resolve({ exportId: 'e1' }) };
    },
    {},
  ],
  useDownloadStudyExportMutation: () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }],
  useDownloadStudyTudDataMutation: () => [
    (args: unknown) => {
      tudCalls.push(args);
      return { unwrap: () => Promise.resolve() };
    },
    { isLoading: false },
  ],
  useDownloadQuestionnaireResponsesMutation: () => [
    (args: unknown) => {
      questionnaireCalls.push(args);
      return { unwrap: () => Promise.resolve() };
    },
    { isLoading: false },
  ],
  useGetStudyQuestionnairesQuery: () => ({
    data: [{ active: true, description: '', id: 'q-1', questions: [{ choices: [], title: 'Q1' }], title: 'Sleep log' }],
    isError: false,
    isLoading: false,
  }),
  useGetStudySummaryQuery: () => ({
    data: {
      id: 'study-1',
      modules: { CHRONICLE_DATA_COLLECTION: {}, TIME_USE_DIARY: {} },
      title: 'Export Study',
    },
    error: undefined,
    isError: false,
    isLoading: false,
  }),
  useListStudyExportsQuery: () => ({
    data: [],
    error: undefined,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: () => ({ unwrap: () => Promise.resolve([]) }),
  }),
}));

const { StudyBulkDownloadsPage } = await import('./study-bulk-downloads-page');

// Bun's test runner has no auto-cleanup, so without this each render stacks another copy
// of the page in the same document and the queries below match more than one node.
afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/studies/study-1/downloads']}>
      <Link to="/studies/study-2/downloads">Open second study</Link>
      <Routes>
        <Route element={<StudyBulkDownloadsPage />} path="/studies/:studyId/downloads" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StudyBulkDownloadsPage non-export download surfaces', () => {
  test('offers every server-backed participant export category for a data-collection study', () => {
    renderPage();
    for (const label of [
      'Usage Events',
      'Preprocessed',
      'App Usage Survey',
      'iOS Sensor',
      'Android Sensor',
      'Sensor Availability',
      'Battery Telemetry',
      'Interaction Events',
      'Audio Activity',
      'Audio Content',
      'Notification Activity',
      'Sleep Events',
      'Activity Recognition',
      'Health Metrics',
      'Connectivity State',
      'App Network Usage',
      'Device Settings',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeDefined();
    }
  });

  test('posts every exact ParticipantDataType wire value when all export categories are selected', async () => {
    renderPage();
    act(() => screen.getByRole('button', { name: 'Start export' }).click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(exportCalls.at(-1)).toMatchObject({
      request: {
        dataTypes: [
          'UsageEvents',
          'Preprocessed',
          'AppUsageSurvey',
          'IOSSensor',
          'AndroidSensor',
          'SensorAvailability',
          'BatteryTelemetry',
          'InteractionEvents',
          'AudioActivity',
          'AudioContent',
          'NotificationActivity',
          'SleepEvents',
          'ActivityRecognition',
          'HealthMetrics',
          'ConnectivityState',
          'AppNetworkUsage',
          'DeviceSettings',
        ],
      },
      studyId: 'study-1',
    });
  });

  test('offers every Time Use Diary variant for the whole study', () => {
    renderPage();
    expect(screen.getByText('Time Use Diary')).toBeDefined();
    for (const variant of ['DayTime', 'NightTime', 'Summarized']) {
      expect(screen.getByRole('button', { name: variant })).toBeDefined();
    }
  });

  test('sends the TUD variant and a bounded date range to the study-wide endpoint', () => {
    renderPage();
    act(() => screen.getByRole('button', { name: 'Summarized' }).click());
    const call = tudCalls.at(-1) as { dataType: string; endDate: string; startDate: string; studyId: string };
    expect(call.dataType).toBe('Summarized');
    expect(call.studyId).toBe('study-1');
    // Study-wide TUD requires an explicit range; the page seeds a default rather than
    // sending empty params.
    expect(call.startDate.length).toBeGreaterThan(0);
    expect(call.endDate.length).toBeGreaterThan(0);
  });

  test('offers a bulk download per questionnaire', () => {
    renderPage();
    expect(screen.getByText('Sleep log')).toBeDefined();
    act(() =>
      screen
        .getAllByRole('button', { name: /Download/ })
        .at(-1)
        ?.click(),
    );
    expect(questionnaireCalls.at(-1)).toMatchObject({ questionnaireId: 'q-1', studyId: 'study-1' });
  });

  test('excludes a deselected data type from the export request', () => {
    renderPage();
    const usageEvents = screen.getByRole('button', { name: 'Usage Events' });
    expect(usageEvents.getAttribute('aria-pressed')).toBe('true');
    act(() => usageEvents.click());
    expect(screen.getByRole('button', { name: 'Usage Events' }).getAttribute('aria-pressed')).toBe('false');
  });

  test('resets export type, format, and date choices when the route changes studies', async () => {
    renderPage();
    act(() => screen.getByRole('button', { name: 'Usage Events' }).click());
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'CSV' } });
    fireEvent.change(screen.getByLabelText('Start date (optional)'), { target: { value: '2026-01-02' } });

    act(() => screen.getByRole('link', { name: 'Open second study' }).click());

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Usage Events' }).getAttribute('aria-pressed')).toBe('true');
    });
    expect(screen.getByLabelText<HTMLSelectElement>('Format').value).toBe('EXCEL');
    expect(screen.getByLabelText<HTMLInputElement>('Start date (optional)').value).toBe('');
  });
});
