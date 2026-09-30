import { afterEach, describe, expect, mock, test } from 'bun:test';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ParticipantStatsMap } from '@/state/study-operations-api';

const stats: ParticipantStatsMap = {};
afterEach(() => {
  for (const id of Object.keys(stats)) delete stats[id];
});

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
  useDownloadParticipantDataMutation: mutation,
  useGetAndroidDiagnosticsQuery: query({
    items: [{
      participantId: 'p-000',
      deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      day: '2026-09-20',
      codes: [{
        eventId: 'loss-1',
        moduleFamily: 'USAGE_LIFECYCLE',
        issueCode: 'USAGE_QUEUE_EVICTED',
        occurrenceCount: 12,
        firstOccurredAt: '2026-09-20T10:00:00Z',
        lastOccurredAt: '2026-09-20T10:00:00Z',
      }],
    }],
    nextCursor: null,
  }),
  useGetIosUploadStatusQuery: query({}),
  useGetParticipantStatsQuery: query(stats),
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
  test('sorts a diary calendar date against an upload instant in local time', () => {
    const midnight = new Date(2024, 0, 1);
    const uploadIsEarlier = midnight.getTimezoneOffset() > 0;
    const upload = new Date(midnight.getTime() + (uploadIsEarlier ? -1 : 1) * 3_600_000).toISOString();
    const emptyStats = { studyId: 'study-1', androidUniqueDates: [], iosUniqueDates: [], tudUniqueDates: [] };
    stats['p-000'] = { ...emptyStats, participantId: 'p-000', tudLastDate: '2024-01-01' };
    stats['p-001'] = { ...emptyStats, participantId: 'p-001', androidLastPing: upload };
    render(
      <MemoryRouter initialEntries={['/studies/study-1/participants']}>
        <Routes>
          <Route element={<StudyParticipantsPage />} path="/studies/:studyId/participants" />
        </Routes>
      </MemoryRouter>,
    );
    const activity = screen.getByRole('button', { name: 'Collection activity' });
    fireEvent.click(activity);
    fireEvent.click(activity);
    const firstIds = participantRows().slice(0, 2).map((box) => box.getAttribute('aria-label'));
    const order = uploadIsEarlier ? ['p-000', 'p-001'] : ['p-001', 'p-000'];
    expect(firstIds).toEqual(order.map((id) => `Select participant ${id}`));
  });

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

  test('an expanded row shows data the device discarded', () => {
    render(
      <MemoryRouter initialEntries={['/studies/study-1/participants']}>
        <Routes>
          <Route element={<StudyParticipantsPage />} path="/studies/:studyId/participants" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByLabelText(/expand row/i)[0] as HTMLElement);
    expect(screen.getByText('Android diagnostics history')).toBeTruthy();
    expect(screen.getByText(/USAGE_QUEUE_EVICTED/)).toBeTruthy();
  });
});
