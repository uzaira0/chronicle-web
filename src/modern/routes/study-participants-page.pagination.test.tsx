import { afterEach, describe, expect, mock, test } from 'bun:test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import tailwindcss from '@tailwindcss/postcss';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import postcss from 'postcss';
import { MemoryRouter, Route, Routes } from 'react-router';
import { COLLECTION_MODULE_ID, PARTICIPATION_STATUS } from '@/generated/chronicle-contracts';
import english from '@/i18n/en/translation.json';
import type {
  AndroidDeviceSensorAvailability,
  CollectionAcknowledgmentEntry,
  DataCollectionSettingSummary,
  Participant,
  ParticipantStatsMap,
} from '@/state/study-operations-api';

const refreshed: string[] = [];
const stats: ParticipantStatsMap = {};
const sensorAvailability: AndroidDeviceSensorAvailability[] = [];
const acknowledgments: CollectionAcknowledgmentEntry[] = [];
const pendingEnrollments: string[] = [];
const cancelledParticipants: string[] = [];
const processingChanges: unknown[] = [];
const downloadRequests: { participantIds: string[]; dataType: string }[] = [];
let dataCollectionSetting: DataCollectionSettingSummary | undefined;
let deletionFailure: Error | undefined;
let erasureFailure: Error | undefined;
let missingDetails = false;
afterEach(() => {
  for (const id of Object.keys(stats)) delete stats[id];
  failedQuery = undefined;
  refreshed.length = 0;
  deletionResults.clear();
  erasedOperations.length = 0;
  sensorAvailability.length = 0;
  acknowledgments.length = 0;
  pendingEnrollments.length = 0;
  cancelledParticipants.length = 0;
  dataCollectionSetting = undefined;
  deletionFailure = undefined;
  erasureFailure = undefined;
  missingDetails = false;
  processingChanges.length = 0;
  downloadRequests.length = 0;
  for (const participant of participants) {
    participant.processingBlockedAt = null;
    participant.statusRevision = 0;
  }
});

const participants: Participant[] = Array.from({ length: 250 }, (_, index) => ({
  candidate: { id: `c-${index}` },
  participantId: `p-${String(index).padStart(3, '0')}`,
  participationStatus: PARTICIPATION_STATUS.ENROLLED,
  participantTags: [],
}));

let failedQuery: string | undefined;
const STATUS_FAILURE = 'The participant status changed in another window.';
const deletionResults = new Map<string, object>();
const erasedOperations: unknown[] = [];
const query =
  (data: unknown, name = '') =>
  () => ({
    data,
    error: { status: 503 },
    isError: failedQuery === name,
    isLoading: false,
    refetch: () => {
      refreshed.push(name);
    },
  });
const mutation = () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }];

const studyOperationsApiModule = await import('@/state/study-operations-api');
await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useSetParticipantProcessingBlockMutation: () => [
    (request: unknown) => ({
      unwrap: () => {
        processingChanges.push(request);
        return Promise.resolve();
      },
    }),
    { isLoading: false },
  ],
  useGetPendingEnrollmentsQuery: query(pendingEnrollments, 'pending'),
  useCancelPendingEnrollmentMutation: () => [
    ({ participantId }: { participantId: string }) => ({
      unwrap: () => {
        cancelledParticipants.push(participantId);
        return Promise.resolve();
      },
    }),
    { isLoading: false },
  ],
  useDeleteStudyParticipantsMutation: () => [
    () => ({
      unwrap: () => (deletionFailure ? Promise.reject(deletionFailure) : Promise.resolve([...deletionResults.keys()])),
    }),
    { isLoading: false },
  ],
  useDownloadParticipantDataMutation: () => [
    (request: { participantIds: string[]; dataType: string }) => {
      downloadRequests.push(request);
      return { unwrap: () => Promise.resolve() };
    },
    { isLoading: false },
  ],
  useDownloadParticipantTudDataMutation: mutation,
  useGetStudyExportAvailabilityQuery: () => ({
    currentData: { dataTypes: ['UsageEvents'], timeUseDiary: false },
    isError: false,
    isFetching: false,
  }),
  useGetAndroidDiagnosticsQuery: query({
    items: [
      {
        participantId: 'p-000',
        randomDeviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        day: '2026-09-20',
        codes: [
          {
            eventId: 'loss-1',
            moduleFamily: 'USAGE_LIFECYCLE',
            issueCode: 'LOCAL_BUFFER_OVERFLOW',
            occurrenceCount: 12,
            firstOccurredAt: '2026-09-20T10:00:00Z',
            lastOccurredAt: '2026-09-20T10:00:00Z',
          },
        ],
      },
    ],
    nextCursor: null,
  }),
  useGetIosUploadStatusQuery: () => query(missingDetails ? undefined : {}, 'ios')(),
  useGetParticipantStatsQuery: () => query(missingDetails ? undefined : stats, 'stats')(),
  useGetStudyCollectionAcknowledgmentsQuery: query(acknowledgments, 'consent'),
  useGetStudyDataCollectionSettingQuery: () => query(dataCollectionSetting, 'collection')(),
  useGetStudyDevicesQuery: () => query(missingDetails ? undefined : {}, 'devices')(),
  useGetStudyParticipantsQuery: query(participants, 'participants'),
  useGetStudySensorAvailabilityQuery: query(sensorAvailability, 'sensors'),
  useGetStudySummaryQuery: () => {
    const summary = { id: 'study-1', modules: {}, title: 'Big Study' };
    return { ...query(summary)(), currentData: summary };
  },
  useGetStudyDeletionsQuery: () => ({
    currentData: [...deletionResults.values()].filter((value) => !(value instanceof Error)),
    isError: [...deletionResults.values()].some((value) => value instanceof Error),
    error: { message: 'Unable to refresh deletion status.' },
    refetch: () => undefined,
  }),
  useLazyGetDeletionOperationQuery: () => [
    (args: { operationId: string }) => ({
      unwrap: () => {
        const result = deletionResults.get(args.operationId);
        return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
      },
    }),
    {},
  ],
  useRegisterParticipantMutation: mutation,
  useUpdateParticipationStatusMutation: () => [
    () => ({
      unwrap: () =>
        Promise.reject(Object.assign(new Error(STATUS_FAILURE), { status: 409, data: { message: STATUS_FAILURE } })),
    }),
    { isLoading: false },
  ],
  useEraseDeletionMutation: () => [
    (request: unknown) => ({
      unwrap: () => {
        erasedOperations.push(request);
        return erasureFailure ? Promise.reject(erasureFailure) : Promise.resolve();
      },
    }),
    { isLoading: false },
  ],
}));

const { StudyParticipantsPage } = await import('./study-participants-page');

function renderPage(entry = '/studies/study-1/participants') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route element={<StudyParticipantsPage />} path="/studies/:studyId/participants" />
      </Routes>
    </MemoryRouter>,
  );
}

function expandFirstRow() {
  const expand = screen.getAllByLabelText(/expand row/i)[0];
  if (!expand) throw new Error('Expected a participant row to expand');
  fireEvent.click(expand);
}

const participantTable = () => screen.getByRole('table', { name: '' });
const participantRows = () =>
  within(participantTable())
    .getAllByRole('checkbox')
    .filter((box) => /select participant/i.test(box.getAttribute('aria-label') ?? ''));

describe('StudyParticipantsPage pagination', () => {
  test('blocks from the row with a required reason and explicit confirmation', async () => {
    renderPage();
    fireEvent.pointerDown(screen.getAllByRole('button', { name: 'More actions' })[0] as HTMLElement, {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Block processing' }));
    const dialog = within(screen.getByRole('dialog'));
    const confirm = dialog.getByRole<HTMLButtonElement>('button', { name: 'Block processing' });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(dialog.getByLabelText('Reason'), { target: { value: 'Participant requested a review' } });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(processingChanges).toEqual([
        {
          studyId: 'study-1',
          participantId: 'p-000',
          reason: 'Participant requested a review',
          blocked: true,
          statusRevision: 0,
        },
      ]),
    );
  });

  test('lists a blocked participant and confirms unblocking without changing participation status', async () => {
    const participant = participants[0];
    if (!participant) throw new Error('Participant fixture is empty');
    participant.processingBlockedAt = '2026-10-18T00:00:00Z';
    participant.statusRevision = 5;
    renderPage();
    expect(screen.getByText('Blocked')).toBeDefined();
    fireEvent.pointerDown(screen.getAllByRole('button', { name: 'More actions' })[0] as HTMLElement, {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unblock processing' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Unblock processing' }));
    await waitFor(() =>
      expect(processingChanges).toEqual([
        {
          studyId: 'study-1',
          participantId: 'p-000',
          blocked: false,
          statusRevision: 5,
        },
      ]),
    );
    expect(participant.participationStatus).toBe(PARTICIPATION_STATUS.ENROLLED);
  });

  test('keeps cancellation visible while the pending query still reports the participant', async () => {
    pendingEnrollments.push('p-000');
    renderPage();
    const action = screen.getByRole('button', { name: 'Cancel pending enrollment' });
    expect(action.closest('tr')?.textContent).toContain('p-000');
    fireEvent.click(action);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke enrollment code' }));
    await waitFor(() => expect(cancelledParticipants).toEqual(['p-000']));
    expect(screen.getByRole('button', { name: 'Cancel pending enrollment' })).toBeTruthy();
  });

  test('announces a rejected deletion inside the confirmation dialog', async () => {
    const message = 'Deletion service unavailable';
    deletionFailure = new Error(message);
    renderPage();
    fireEvent.click(participantRows()[0] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /Delete selected/i }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Delete' }));
    expect((await dialog.findByRole('alert')).textContent).toContain(message);
  });

  const accelerometerModule = COLLECTION_MODULE_ID.sensor_accelerometer;
  const lightModule = COLLECTION_MODULE_ID.sensor_light;
  const currentSettingsVersion = 2;
  const latestAcknowledgment: CollectionAcknowledgmentEntry = {
    currentConsentedModules: [accelerometerModule],
    acknowledgedAt: '2026-10-07T12:00:00Z',
    acknowledgedModules: [accelerometerModule],
    declinedModules: [lightModule],
    id: 'latest',
    participantId: 'p-000',
    recordedAt: '2026-10-07T12:00:00Z',
    settingsVersion: currentSettingsVersion,
    sourceRandomDeviceId: 'device-1',
    studyId: 'study-1',
  };
  const sensorReport: AndroidDeviceSensorAvailability = {
    availableSensors: ['accelerometer', 'light'],
    randomDeviceId: latestAcknowledgment.sourceRandomDeviceId,
    participantId: latestAcknowledgment.participantId,
  };

  test('participant details show usage consent without a hardware sensor report', () => {
    acknowledgments.push({ ...latestAcknowledgment, acknowledgedModules: [COLLECTION_MODULE_ID.usage_events] });
    renderPage();
    fireEvent.click(screen.getByLabelText('Expand row for p-000'));
    expect(screen.getByText(COLLECTION_MODULE_ID.usage_events)).toBeTruthy();
    expect(screen.getByText(latestAcknowledgment.sourceRandomDeviceId)).toBeTruthy();
  });

  const decisions: {
    name: string;
    decision: CollectionAcknowledgmentEntry;
    consented: boolean;
    unavailable: boolean;
  }[] = [
    {
      name: 'per-module decline-only delta',
      decision: { ...latestAcknowledgment, acknowledgedModules: [], trigger: 'PARTICIPANT_TOGGLE' },
      consented: true,
      unavailable: false,
    },
    {
      name: 'withdrawal after acceptance',
      decision: {
        ...latestAcknowledgment,
        acknowledgedModules: [],
        declinedModules: [accelerometerModule, lightModule],
        trigger: 'WITHDRAWAL' as const,
        currentConsentedModules: [],
      },
      consented: false,
      unavailable: false,
    },
    {
      name: 'acceptance of an older settings revision',
      decision: { ...latestAcknowledgment, settingsVersion: currentSettingsVersion - 1 },
      consented: true,
      unavailable: false,
    },
    {
      name: 'unavailable module in the latest snapshot',
      decision: { ...latestAcknowledgment, declinedModules: [], unavailableModules: [lightModule] },
      consented: true,
      unavailable: true,
    },
  ];
  test.each(decisions)(
    'shows DataCollection sensor consent for $name using per-module history',
    ({ decision, consented, unavailable }) => {
      dataCollectionSetting = {
        '@class': 'com.openlattice.chronicle.collection.AndroidDataCollectionSetting',
        version: 2,
        settingsVersion: currentSettingsVersion,
        modules: { [accelerometerModule]: { enabled: true }, [lightModule]: { enabled: true } },
      };
      sensorAvailability.push(sensorReport);
      acknowledgments.push(decision, {
        ...latestAcknowledgment,
        id: 'older',
        recordedAt: '2026-10-06T12:00:00Z',
        acknowledgedModules: [accelerometerModule, lightModule],
        declinedModules: [],
      });
      renderPage();
      expandFirstRow();
      const bucket = screen.getByText(
        `${unavailable ? 'Not available on device' : 'Not consented on device'} (${consented ? 1 : 2})`,
      ).parentElement;
      expect(bucket).toBeTruthy();
      expect(within(bucket as HTMLElement).getByText('Light')).toBeTruthy();
      if (consented) {
        const accepted = screen.getByText('Consented on device (1)').parentElement;
        expect(within(accepted as HTMLElement).getByText('Accelerometer')).toBeTruthy();
        expect(within(accepted as HTMLElement).queryByText('Light')).toBeNull();
      } else {
        expect(screen.queryByText('Consented on device (1)')).toBeNull();
        expect(screen.queryByText('Hardware sensors consented')).toBeNull();
      }
    },
  );

  test('a study sensor missing from the one available list shows as not available on the device', () => {
    const gyroscopeModule = COLLECTION_MODULE_ID.sensor_gyroscope;
    dataCollectionSetting = {
      '@class': 'com.openlattice.chronicle.collection.AndroidDataCollectionSetting',
      version: 2,
      settingsVersion: currentSettingsVersion,
      modules: { [accelerometerModule]: { enabled: true }, [gyroscopeModule]: { enabled: true } },
    };
    sensorAvailability.push(sensorReport);
    acknowledgments.push({ ...latestAcknowledgment, acknowledgedModules: [accelerometerModule, gyroscopeModule] });
    renderPage();
    expandFirstRow();
    const missing = screen.getByText('Not available on device (1)').parentElement;
    expect(within(missing as HTMLElement).getByText('Gyroscope')).toBeTruthy();
    // A sensor the device has but the study does not ask for is never named as missing.
    expect(within(missing as HTMLElement).queryByText('Light')).toBeNull();
  });

  // A failed enrollment retried on the same phone is a new app instance with the same hardware: each instance keeps
  // its own report, and the page says the identical reports are repeated enrollments, not two phones.
  test.each([
    [1, false],
    [2, true],
  ])('%i identical sensor report(s) from re-enrollment show the repeated-enrollment note: %s', (instances, note) => {
    for (let index = 0; index < instances; index += 1)
      sensorAvailability.push({ ...sensorReport, randomDeviceId: `device-${index + 1}` });
    renderPage();
    expandFirstRow();
    expect(screen.getByText(english.participants.sensor_matrix)).toBeTruthy();
    expect(screen.queryByText(english.participants.sensor_matrix_dupes) !== null).toBe(note);
  });

  test.each(['constructor', '__proto__', 'toString'])(
    'renders and expands participant %s without statistics or devices',
    (participantId) => {
      const participant = participants[0];
      if (!participant) throw new Error('Expected a participant fixture');
      const originalId = participant.participantId;
      participant.participantId = participantId;
      missingDetails = true;
      try {
        sensorAvailability.push({ ...sensorReport, participantId });
        acknowledgments.push({ ...latestAcknowledgment, participantId });
        renderPage(`/studies/study-1/participants?q=${participantId}`);
        expect(participantRows()).toHaveLength(1);
        expandFirstRow();
        expect(screen.getByText('No device instance records.')).toBeTruthy();
        expect(screen.getByText('Android diagnostics history')).toBeTruthy();
        expect(participantTable()).toBeTruthy();
      } finally {
        participant.participantId = originalId;
      }
    },
  );

  test.each(['pending', 'stats', 'collection', 'devices', 'ios', 'sensors', 'consent'])(
    'reports a failed %s query before interpreting empty details',
    (name) => {
      failedQuery = name;
      renderPage();
      if (!['pending', 'stats', 'collection'].includes(name)) expandFirstRow();
      expect(
        screen.getByText(
          'Participant details could not be loaded. Retry to verify statistics, devices, and consent. (status 503)',
        ),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
      expect(screen.queryByRole('table')).toBeNull();
    },
  );

  test('preserves every committed deletion ID and settled success when a status request fails', async () => {
    deletionResults.set('operation-a', { operationId: 'operation-a', status: 'COMPLETED' });
    deletionResults.set('operation-b', new Error('status unavailable'));
    renderPage();
    for (const box of participantRows().slice(0, 2)) fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: /Delete selected/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('operation-a')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Completed')).toBeTruthy());
    expect(screen.getByText('operation-b')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('refresh deletion');
    expect(screen.queryByText('Unable to delete participants.')).toBeNull();
  });

  test('loads failed and pending erasures after the page is reopened, each waiting for Erase now', () => {
    deletionResults.set('persisted-failure', { erasable: true, operationId: 'persisted-failure', status: 'FAILED' });
    deletionResults.set('persisted-pending', {
      erasable: true,
      operationId: 'persisted-pending',
      status: 'QUARANTINED',
    });
    deletionResults.set('persisted-done', { erasable: false, operationId: 'persisted-done', status: 'COMPLETED' });
    // An erasure whose worker died mid-run: the server says it may run again, whatever its status reads.
    deletionResults.set('persisted-interrupted', {
      erasable: true,
      operationId: 'persisted-interrupted',
      status: 'ERASING',
    });
    renderPage();
    expect(screen.getByText('persisted-failure')).toBeTruthy();
    expect(screen.getByText('persisted-pending')).toBeTruthy();
    // Only an owner's press erases; completed operations offer nothing to run.
    expect(screen.getAllByRole('button', { name: 'Erase now' })).toHaveLength(3);
    expect(erasedOperations).toEqual([]);
  });

  test('labels a pending erasure in words and names its participant, not the operation ID', () => {
    deletionResults.set('op-uuid-1', {
      erasable: true,
      operationId: 'op-uuid-1',
      participantId: 'p-007',
      status: 'QUARANTINED',
    });
    deletionResults.set('op-uuid-2', { mode: 'STUDY_ERASURE', operationId: 'op-uuid-2', status: 'ERASING' });
    renderPage();
    const [participantRow, studyRow] = within(screen.getByRole('list', { name: 'Deletion status' })).getAllByRole(
      'listitem',
    );
    expect(participantRow?.textContent).toContain('p-007');
    expect(within(participantRow as HTMLElement).getAllByText('Pending erasure')).toHaveLength(1);
    expect(studyRow?.textContent).toContain('Whole study');
    expect(within(studyRow as HTMLElement).getByText('Erasing')).toBeTruthy();
    for (const hidden of ['op-uuid-1', 'op-uuid-2', 'QUARANTINED', 'ERASING']) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
  });

  test('Erase now runs the erasure of exactly the confirmed operation', async () => {
    deletionResults.set('persisted-pending', {
      erasable: true,
      mode: 'WITHDRAW_AND_ERASE',
      operationId: 'persisted-pending',
      status: 'QUARANTINED',
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Erase now' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Erase now' }));
    await waitFor(() => expect(erasedOperations).toEqual([{ operationId: 'persisted-pending', studyId: 'study-1' }]));
  });

  test('a failed Erase now keeps the dialog open with a next step and does not leave the study', async () => {
    erasureFailure = new Error('');
    deletionResults.set('study-erasure', {
      erasable: true,
      mode: 'STUDY_ERASURE',
      operationId: 'study-erasure',
      status: 'QUARANTINED',
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Erase now' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Erase now' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'Erasure did not finish. Reload the list to see its current state, then try again.',
    );
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(screen.getByText('Whole study')).toBeTruthy();
  });

  test('restores search, sorting and revealed rows from a copied URL', () => {
    renderPage('/studies/study-1/participants?q=p-&sort=id&dir=desc&page=2');
    expect(screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search participants' }).value).toBe('p-');
    expect(participantRows()).toHaveLength(200);
    expect(participantRows()[0]?.getAttribute('aria-label')).toBe('Select participant p-249');
  });
  test('sorts a diary calendar date against an upload instant in local time', () => {
    const midnight = new Date(2024, 0, 1);
    const uploadIsEarlier = midnight.getTimezoneOffset() > 0;
    const upload = new Date(midnight.getTime() + (uploadIsEarlier ? -1 : 1) * 3_600_000).toISOString();
    const emptyStats = { studyId: 'study-1', androidUniqueDates: [], iosUniqueDates: [], tudUniqueDates: [] };
    stats['p-000'] = { ...emptyStats, participantId: 'p-000', tudLastDate: '2024-01-01' };
    stats['p-001'] = { ...emptyStats, participantId: 'p-001', androidLastPing: upload };
    renderPage();
    const activity = screen.getByRole('button', { name: 'Collection activity' });
    fireEvent.click(activity);
    fireEvent.click(activity);
    const firstIds = participantRows()
      .slice(0, 2)
      .map((box) => box.getAttribute('aria-label'));
    const order = uploadIsEarlier ? ['p-000', 'p-001'] : ['p-001', 'p-000'];
    expect(firstIds).toEqual(order.map((id) => `Select participant ${id}`));
  });

  test('renders 100 rows at a time and reveals the rest on demand', () => {
    renderPage();

    expect(participantRows()).toHaveLength(100);
    fireEvent.click(screen.getByRole('button', { name: 'Show 100 more (150 hidden)' }));
    expect(participantRows()).toHaveLength(200);
    fireEvent.click(screen.getByRole('button', { name: 'Show 100 more (50 hidden)' }));
    expect(participantRows()).toHaveLength(250);
    expect(screen.queryByRole('button', { name: /^Show 100 more/ })).toBeNull();
  });

  test('select all selects only the rows on screen', () => {
    renderPage();

    fireEvent.click(screen.getByLabelText(/select all/i));
    expect(participantRows().filter((box) => (box as HTMLInputElement).checked)).toHaveLength(100);
    // Rows revealed afterwards were never seen, so they must not already be selected.
    fireEvent.click(screen.getByRole('button', { name: 'Show 100 more (150 hidden)' }));
    expect(participantRows().filter((box) => (box as HTMLInputElement).checked)).toHaveLength(100);
  });

  // The download receives exactly the participants the operator selected, across Show more,
  // individual changes, search, sorting and clearing the search.
  test('downloads exactly the selected participants after Show more, search and sort', async () => {
    renderPage();
    const box = (id: string) => screen.getByRole<HTMLInputElement>('checkbox', { name: `Select participant ${id}` });
    fireEvent.click(screen.getByLabelText(/select all/i));
    fireEvent.click(screen.getByRole('button', { name: 'Show 100 more (150 hidden)' }));
    fireEvent.click(box('p-003'));
    fireEvent.click(box('p-050'));
    fireEvent.click(box('p-150'));
    const search = screen.getByRole('searchbox', { name: 'Search participants' });
    fireEvent.change(search, { target: { value: 'p-15' } });
    await waitFor(() => expect(participantRows().length).toBeLessThan(100));
    fireEvent.click(screen.getByRole('button', { name: 'Collection activity' }));
    fireEvent.change(search, { target: { value: '' } });
    // Changing the search starts the list again at its first page; selections outside it are kept.
    await waitFor(() => expect(participantRows()).toHaveLength(100));

    const expected = [
      ...Array.from({ length: 100 }, (_, index) => `p-${String(index).padStart(3, '0')}`).filter(
        (id) => id !== 'p-003' && id !== 'p-050',
      ),
      'p-150',
    ].sort();
    fireEvent.click(screen.getByRole('button', { name: `Download data (${expected.length})` }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Usage Events' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /^Download$/ }));
    await waitFor(() => expect(downloadRequests).toHaveLength(1));
    expect(downloadRequests[0]?.dataType).toBe('UsageEvents');
    expect([...(downloadRequests[0]?.participantIds ?? [])].sort()).toEqual(expected);
  });

  test('bulk removal names selected participants hidden by the current search', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select participant p-000' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select participant p-001' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search participants' }), { target: { value: 'p-002' } });
    await waitFor(() => expect(participantRows()).toHaveLength(1));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select participant p-002' }));
    fireEvent.click(screen.getByRole('button', { name: /Delete selected/i }));
    const dialog = await screen.findByRole('dialog');
    for (const id of ['p-000', 'p-001', 'p-002']) expect(within(dialog).getByText(id)).toBeTruthy();
  });

  test('bulk removal keeps all 250 named targets and keyboard controls reachable in short viewports', async () => {
    renderPage('/studies/study-1/participants?page=3');
    expect(participantRows()).toHaveLength(250);
    fireEvent.click(screen.getByLabelText(/select all/i));
    fireEvent.click(screen.getByRole('button', { name: /Delete selected/i }));
    const html = (await screen.findByRole('dialog')).outerHTML;
    expect(within(screen.getByRole('dialog')).getAllByRole('listitem')).toHaveLength(250);
    const stylesheet = resolve('src/modern/styles/index.css');
    const { css } = await postcss([tailwindcss() as unknown as postcss.AcceptedPlugin]).process(
      readFileSync(stylesheet, 'utf8'),
      { from: stylesheet },
    );
    const screenshots = resolve('build/operator-test-runs/L01-bulk-removal');
    mkdirSync(screenshots, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    try {
      for (const viewport of [
        { width: 1280, height: 720 },
        { width: 390, height: 480 },
      ]) {
        const page = await browser.newPage({ viewport });
        await page.setContent(`<style>${css}</style><button>Before dialog</button>${html}`);
        const dialog = page.getByRole('dialog');
        const bounds = await dialog.boundingBox();
        if (!bounds) throw new Error('Bulk removal dialog has no rendered bounds');
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
        const geometry = await dialog.evaluate((element) => ({
          overflows: element.scrollHeight > element.clientHeight,
          overflowY: getComputedStyle(element).overflowY,
          fitsWidth: element.scrollWidth <= element.clientWidth,
        }));
        expect(geometry).toEqual({ overflows: true, overflowY: 'auto', fitsWidth: true });
        await page.getByRole('button', { name: 'Before dialog' }).focus();
        for (const name of ['Cancel', 'Delete']) {
          await page.keyboard.press('Tab');
          const control = page.getByRole('button', { name, exact: true });
          expect(await control.evaluate((element) => element === document.activeElement)).toBe(true);
          const rect = await control.boundingBox();
          if (!rect) throw new Error(`${name} control has no rendered bounds`);
          expect(rect.y).toBeGreaterThanOrEqual(bounds.y);
          expect(rect.y + rect.height).toBeLessThanOrEqual(bounds.y + bounds.height);
        }
        await page.screenshot({ path: `${screenshots}/${viewport.width}x${viewport.height}.png` });
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }, 20_000);

  test('a shared participant URL restores expanded rows', () => {
    renderPage('/studies/study-1/participants?expanded=p-000');
    expect(screen.getByText('Android diagnostics history')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/collapse row/i));
    expect(screen.queryByText('Android diagnostics history')).toBeNull();
  });

  test('an expanded row shows data the device discarded', () => {
    renderPage();

    expandFirstRow();
    expect(screen.getByText('Android diagnostics history')).toBeTruthy();
    expect(screen.getByText(/Local buffer full/)).toBeTruthy();
  });

  test('rejects a participant ID the server would refuse before submitting it', () => {
    renderPage();

    const input = screen.getByLabelText('New participant ID');
    const register = screen.getByRole<HTMLButtonElement>('button', { name: 'Register' });
    fireEvent.change(input, { target: { value: 'niño 07' } });
    expect(screen.getByRole('alert').textContent).toContain('no spaces or accents');
    expect(register.disabled).toBe(false);
    fireEvent.click(register);
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'CL-001' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(register.disabled).toBe(false);
  });
});

test('refresh reloads participant observations including expanded consent and devices', () => {
  renderPage();
  expandFirstRow();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh participants' }));
  // Status, last upload, consent and availability are refetched together.
  expect([...new Set(refreshed)].sort()).toEqual(
    ['collection', 'consent', 'devices', 'ios', 'participants', 'pending', 'sensors', 'stats'].sort(),
  );
});

// A failed status change for one participant never shows in the next participant's dialog.
test('a failed enrollment change leaves no error in the next participant dialog', async () => {
  renderPage();
  const openEnrollment = async (row: number) => {
    fireEvent.pointerDown(screen.getAllByRole('button', { name: 'More actions' })[row] as HTMLElement, {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Change enrollment' }));
    return within(await screen.findByRole('dialog'));
  };
  const first = await openEnrollment(0);
  fireEvent.click(first.getByRole('button', { name: 'Pause enrollment' }));
  expect((await first.findByRole('alert')).textContent).toBe(STATUS_FAILURE);
  fireEvent.click(first.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const second = await openEnrollment(1);
  expect(second.getByText('Pause collecting data on p-001?')).toBeTruthy();
  expect(second.queryByRole('alert')).toBeNull();
  expect(screen.queryByText(STATUS_FAILURE)).toBeNull();
});
