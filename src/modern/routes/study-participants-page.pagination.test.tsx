import { afterEach, describe, expect, mock, test } from 'bun:test';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type {
  AndroidDeviceSensorAvailability,
  CollectionAcknowledgmentEntry,
  DataCollectionSettingSummary,
  ParticipantStatsMap,
} from '@/state/study-operations-api';

const stats: ParticipantStatsMap = {};
const sensorAvailability: AndroidDeviceSensorAvailability[] = [];
const acknowledgments: CollectionAcknowledgmentEntry[] = [];
let dataCollectionSetting: DataCollectionSettingSummary | undefined;
let deletionFailure: Error | undefined;
let missingDetails = false;
afterEach(() => {
  for (const id of Object.keys(stats)) delete stats[id];
  failedQuery = undefined;
  deletionResults.clear();
  sensorAvailability.length = 0;
  acknowledgments.length = 0;
  dataCollectionSetting = undefined;
  deletionFailure = undefined;
  missingDetails = false;
});

const participants = Array.from({ length: 250 }, (_, index) => ({
  candidate: { id: `c-${index}` },
  participantId: `p-${String(index).padStart(3, '0')}`,
  participationStatus: 'ENROLLED' as const,
  participantTags: [],
}));

let failedQuery: string | undefined;
const deletionResults = new Map<string, object>();
const query =
  (data: unknown, name = '') =>
  () => ({ data, error: { status: 503 }, isError: failedQuery === name, isLoading: false, refetch: () => undefined });
const mutation = () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }];

const studyOperationsApiModule = await import('@/state/study-operations-api');
await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useDeleteStudyParticipantsMutation: () => [
    () => ({
      unwrap: () => (deletionFailure ? Promise.reject(deletionFailure) : Promise.resolve([...deletionResults.keys()])),
    }),
    { isLoading: false },
  ],
  useDownloadParticipantDataMutation: mutation,
  useGetAndroidDiagnosticsQuery: query({
    items: [
      {
        participantId: 'p-000',
        deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        day: '2026-09-20',
        codes: [
          {
            eventId: 'loss-1',
            moduleFamily: 'USAGE_LIFECYCLE',
            issueCode: 'USAGE_QUEUE_EVICTED',
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
  useGetStudyParticipantsQuery: query(participants),
  useGetStudySensorAvailabilityQuery: query(sensorAvailability, 'sensors'),
  useGetStudySummaryQuery: query({ id: 'study-1', modules: {}, title: 'Big Study' }),
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

const participantRows = () =>
  within(screen.getByRole('table'))
    .getAllByRole('checkbox')
    .filter((box) => /select participant/i.test(box.getAttribute('aria-label') ?? ''));

describe('StudyParticipantsPage pagination', () => {
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

  const accelerometerModule = 'sensor_accelerometer';
  const lightModule = 'sensor_light';
  const currentSettingsVersion = 2;
  const latestAcknowledgment: CollectionAcknowledgmentEntry = {
    acknowledgedAt: '2026-10-07T12:00:00Z',
    acknowledgedModules: [accelerometerModule],
    declinedModules: [lightModule],
    id: 'latest',
    participantId: 'p-000',
    recordedAt: '2026-10-07T12:00:00Z',
    settingsVersion: currentSettingsVersion,
    sourceDeviceId: 'device-1',
    studyId: 'study-1',
  };
  const sensorReport: AndroidDeviceSensorAvailability = {
    availableSensors: ['accelerometer', 'light'],
    deviceId: latestAcknowledgment.sourceDeviceId,
    participantId: latestAcknowledgment.participantId,
    unavailableSensors: [],
  };

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
      },
      consented: false,
      unavailable: false,
    },
    {
      name: 'acceptance of an older settings revision',
      decision: { ...latestAcknowledgment, settingsVersion: currentSettingsVersion - 1 },
      consented: false,
      unavailable: false,
    },
    {
      name: 'unavailable module in the latest snapshot',
      decision: { ...latestAcknowledgment, declinedModules: [], unavailableModules: [lightModule] },
      consented: true,
      unavailable: true,
    },
  ];
  test.each(decisions)('shows DataCollection sensor consent for $name using per-module history', ({
    decision,
    consented,
    unavailable,
  }) => {
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
  });

  test.each([
    'constructor',
    '__proto__',
    'toString',
  ])('renders and expands participant %s without statistics or devices', (participantId) => {
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
      expect(screen.getByRole('table')).toBeTruthy();
    } finally {
      participant.participantId = originalId;
    }
  });

  test.each([
    'stats',
    'collection',
    'devices',
    'ios',
    'sensors',
    'consent',
  ])('reports a failed %s query before interpreting empty details', (name) => {
    failedQuery = name;
    renderPage();
    if (!['stats', 'collection'].includes(name)) expandFirstRow();
    expect(
      screen.getByText(
        'Participant details could not be loaded. Retry to verify statistics, devices, and consent. (status 503)',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

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

  test('restores search, sorting and revealed rows from a copied URL', () => {
    renderPage('/studies/study-1/participants?q=p-&sort=id&dir=desc&page=2');
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Search participants' }).value).toBe('p-');
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

  test('an expanded row shows data the device discarded', () => {
    renderPage();

    expandFirstRow();
    expect(screen.getByText('Android diagnostics history')).toBeTruthy();
    expect(screen.getByText(/USAGE_QUEUE_EVICTED/)).toBeTruthy();
  });

  test('rejects a participant ID the server would refuse before submitting it', () => {
    renderPage();

    const input = screen.getByLabelText('New participant ID');
    const register = screen.getByRole<HTMLButtonElement>('button', { name: 'Register' });
    fireEvent.change(input, { target: { value: 'niño 07' } });
    expect(screen.getByRole('alert').textContent).toContain('no spaces or accents');
    expect(register.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'CL-001' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(register.disabled).toBe(false);
  });
});
