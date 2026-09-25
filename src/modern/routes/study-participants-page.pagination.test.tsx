import { describe, expect, mock, test } from 'bun:test';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const participants = Array.from({ length: 250 }, (_, index) => ({
  candidate: { id: `c-${index}` },
  participantId: `p-${String(index).padStart(3, '0')}`,
  participationStatus: 'ENROLLED' as const,
  participantTags: [],
}));

const query = (data: unknown) => () => ({ data, error: undefined, isError: false, isLoading: false });
const mutation = () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }];

const studyOperationsApiModule = await import('@/state/study-operations-api');
await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useDeleteStudyParticipantsMutation: mutation,
  useGetIosUploadStatusQuery: query({}),
  useGetParticipantStatsQuery: query({}),
  useGetStudyCollectionAcknowledgmentsQuery: query([]),
  useGetStudyDataCollectionSettingQuery: query(undefined),
  useGetStudyDevicesQuery: query({}),
  useGetStudyParticipantsQuery: query(participants),
  useGetStudySensorAvailabilityQuery: query([]),
  useGetStudySummaryQuery: query({ id: 'study-1', modules: {}, title: 'Big Study' }),
  useLazyGetDeletionOperationQuery: () => [() => ({ unwrap: () => Promise.resolve() }), {}],
  useRegisterParticipantMutation: mutation,
}));

const { StudyParticipantsPage } = await import('./study-participants-page');

const participantRows = () =>
  within(screen.getByRole('table'))
    .getAllByRole('checkbox')
    .filter((box) => /select participant/i.test(box.getAttribute('aria-label') ?? ''));

describe('StudyParticipantsPage pagination', () => {
  test('renders 100 rows at a time and reveals the rest on demand', () => {
    render(
      <MemoryRouter initialEntries={['/studies/study-1/participants']}>
        <Routes>
          <Route element={<StudyParticipantsPage />} path="/studies/:studyId/participants" />
        </Routes>
      </MemoryRouter>,
    );

    expect(participantRows()).toHaveLength(100);
    fireEvent.click(screen.getByRole('button', { name: 'Show 100 more (150 hidden)' }));
    expect(participantRows()).toHaveLength(200);
    fireEvent.click(screen.getByRole('button', { name: 'Show 100 more (50 hidden)' }));
    expect(participantRows()).toHaveLength(250);
    expect(screen.queryByRole('button', { name: /^Show 100 more/ })).toBeNull();
  });

  test('select all selects only the rows on screen', () => {
    render(
      <MemoryRouter initialEntries={['/studies/study-1/participants']}>
        <Routes>
          <Route element={<StudyParticipantsPage />} path="/studies/:studyId/participants" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText(/select all/i));
    expect(participantRows().filter((box) => (box as HTMLInputElement).checked)).toHaveLength(100);
    // Rows revealed afterwards were never seen, so they must not already be selected.
    fireEvent.click(screen.getByRole('button', { name: 'Show 100 more (150 hidden)' }));
    expect(participantRows().filter((box) => (box as HTMLInputElement).checked)).toHaveLength(100);
  });
});
