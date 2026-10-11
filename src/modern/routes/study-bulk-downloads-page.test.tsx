import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { StudyExportJobInfo } from '@/state/study-operations-api';

let createCalls = 0;
type CreateArg = { request: { startDate?: string; endDate?: string } };
let lastCreate: CreateArg | undefined;
let resolveCreate: ((value: { exportId: string }) => void) | undefined;
let exportJobs: StudyExportJobInfo[] = [];

afterEach(() => {
  cleanup();
  exportJobs = [];
});

const studyOperationsApiModule = await import('@/state/study-operations-api');

await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useCreateStudyExportMutation: () => [
    (arg: CreateArg) => {
      createCalls += 1;
      lastCreate = arg;
      return {
        unwrap: () =>
          new Promise<{ exportId: string }>((resolve) => {
            resolveCreate = resolve;
          }),
      };
    },
    { isLoading: false },
  ],
  useDownloadStudyExportMutation: () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }],
  useDownloadStudyTudDataMutation: () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }],
  useDownloadQuestionnaireResponsesMutation: () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }],
  useGetStudyDataCollectionSettingQuery: () => ({ data: undefined }),
  useGetStudyQuestionnairesQuery: () => ({ data: [], isError: false, isLoading: false }),
  useGetStudySummaryQuery: () => ({
    data: { id: 'study-1', modules: { ANDROID_SENSOR: {} }, title: 'Export Study' },
    error: undefined,
    isError: false,
    isLoading: false,
  }),
  useListStudyExportsQuery: () => ({
    data: exportJobs,
    error: undefined,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: () => ({ unwrap: () => Promise.resolve([]) }),
  }),
}));

const { StudyBulkDownloadsPage } = await import('./study-bulk-downloads-page');

test.each([
  ['Export expired; create a new export', 'Export expired; create a new export'],
  [
    'java.lang.IllegalStateException\n  at com.openlattice.ExportService.run(ExportService.kt:10)',
    'Download failed. Try again; if it keeps failing, contact the study team.',
  ],
])('shows sanitized failed-export recovery details: %s', (errorMessage, expected) => {
  exportJobs = [
    {
      exportId: 'expired-export',
      studyId: 'study-1',
      format: 'CSV',
      status: 'FAILED',
      rowCount: 0,
      createdAt: '2026-10-06T10:00:00Z',
      errorMessage,
    },
  ];
  render(
    <MemoryRouter initialEntries={['/studies/study-1/downloads']}>
      <Routes>
        <Route element={<StudyBulkDownloadsPage />} path="/studies/:studyId/downloads" />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByRole('alert').textContent).toBe(expected);
});

describe('StudyBulkDownloadsPage submission fence', () => {
  test('coalesces two synchronous start clicks into one export job', async () => {
    createCalls = 0;
    resolveCreate = undefined;

    render(
      <MemoryRouter initialEntries={['/studies/study-1/downloads']}>
        <Routes>
          <Route element={<StudyBulkDownloadsPage />} path="/studies/:studyId/downloads" />
        </Routes>
      </MemoryRouter>,
    );

    const start = screen.getByRole('button', { name: 'Start export' });
    act(() => {
      start.click();
      start.click();
    });

    await waitFor(() => expect(createCalls).toBe(1));

    await act(async () => {
      resolveCreate?.({ exportId: 'export-1' });
      await Promise.resolve();
    });
  });
});

describe('StudyBulkDownloadsPage form controls', () => {
  test('export-format select draws its boundary with the 3:1 input token (SC 1.4.11)', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/studies/study-1/downloads']}>
        <Routes>
          <Route element={<StudyBulkDownloadsPage />} path="/studies/:studyId/downloads" />
        </Routes>
      </MemoryRouter>,
    );
    const select = container.querySelector('select#export-format') as HTMLElement;
    expect(select.classList.contains('border-input')).toBe(true);
    expect(select.classList.contains('border-border')).toBe(false);
  });
});

describe('StudyBulkDownloadsPage date range', () => {
  test('exports whole local days, not UTC days', async () => {
    lastCreate = undefined;
    const { container } = render(
      <MemoryRouter initialEntries={['/studies/study-1/downloads']}>
        <Routes>
          <Route element={<StudyBulkDownloadsPage />} path="/studies/:studyId/downloads" />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(container.querySelector('#export-start') as HTMLElement, { target: { value: '2026-09-01' } });
    fireEvent.change(container.querySelector('#export-end') as HTMLElement, { target: { value: '2026-09-30' } });
    act(() => screen.getByRole('button', { name: 'Start export' }).click());

    // Local midnight on the first day up to (exclusive) local midnight after the last day.
    await waitFor(() => expect(lastCreate).toBeDefined());
    const sent = (lastCreate as CreateArg | undefined)?.request;
    expect(Date.parse(sent?.startDate ?? '')).toBe(new Date(2026, 8, 1).getTime());
    expect(Date.parse(sent?.endDate ?? '')).toBe(new Date(2026, 9, 1).getTime());
    await act(async () => {
      resolveCreate?.({ exportId: 'export-2' });
      await Promise.resolve();
    });
  });
});
