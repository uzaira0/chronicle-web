import { describe, expect, mock, test } from 'bun:test';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

let createCalls = 0;
let resolveCreate: ((value: { exportId: string }) => void) | undefined;

const studyOperationsApiModule = await import('@/state/study-operations-api');

await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useCreateStudyExportMutation: () => [
    () => {
      createCalls += 1;
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
    data: [],
    error: undefined,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: () => ({ unwrap: () => Promise.resolve([]) }),
  }),
}));

const { StudyBulkDownloadsPage } = await import('./study-bulk-downloads-page');

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

    expect(createCalls).toBe(1);

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
