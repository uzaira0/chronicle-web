import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PARTICIPANT_DATA_TYPES } from '@/generated/chronicle-contracts';
import english from '@/i18n/en/translation.json';
import { PARTICIPANT_DATA_TYPE_OPTIONS } from '@/lib/participant-data-types';

const downloadCalls: unknown[] = [];
let downloadFailure: unknown;
let availabilityLoading = false;
const LOADED_STUDY = { currentData: { id: 's1', settings: { TimeUseDiary: { timeZone: 'America/Santiago' } } } };
let studySummary: { currentData?: unknown; isError?: boolean; error?: unknown } = LOADED_STUDY;
let studyRefetches = 0;
const studyOperationsApiModule = await import('@/state/study-operations-api');

await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useGetStudySummaryQuery: () => ({ ...studySummary, refetch: () => void studyRefetches++ }),
  useGetStudyExportAvailabilityQuery: () => ({
    currentData: availabilityLoading ? undefined : { dataTypes: PARTICIPANT_DATA_TYPES, timeUseDiary: true },
    isFetching: availabilityLoading,
  }),
  useDownloadParticipantDataMutation: () => [
    (args: unknown) => {
      downloadCalls.push(args);
      return {
        unwrap: () =>
          Promise.resolve().then(() => {
            if (downloadFailure) throw downloadFailure as unknown;
          }),
      };
    },
    { isLoading: false },
  ],
  useDownloadParticipantTudDataMutation: () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }],
}));

const { DownloadParticipantDataModal } = await import('./download-participant-data-modal');

function pickRange() {
  fireEvent.change(screen.getByLabelText(/^Start date/), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByLabelText(/^End date/), { target: { value: '2026-09-07' } });
}

afterEach(() => {
  cleanup();
  downloadCalls.length = 0;
  downloadFailure = undefined;
  availabilityLoading = false;
  studySummary = LOADED_STUDY;
  studyRefetches = 0;
});

describe('DownloadParticipantDataModal export coverage', () => {
  // The server refuses an export it has no disk space for: the researcher sees the refusal in the open dialog with
  // their choices intact, and the retry after space is freed downloads and closes it. Escape closes it too.
  test('a refused export stays open with the failure, and a retry downloads and closes', async () => {
    const onClose = mock(() => undefined);
    downloadFailure = { status: 507, data: '' };
    render(<DownloadParticipantDataModal onClose={onClose} participantIds={['p1']} studyId="s1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Usage Events' }));
    pickRange();
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Download' })));
    expect(screen.getByText(`${english.common.download_failed} (status 507)`)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText<HTMLInputElement>(/^Start date/).value).toBe('2026-09-01');

    downloadFailure = undefined;
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Download' })));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(downloadCalls).toEqual([
      expect.objectContaining({ dataType: 'UsageEvents', startDate: '2026-09-01', endDate: '2026-09-07' }),
      expect.objectContaining({ dataType: 'UsageEvents', startDate: '2026-09-01', endDate: '2026-09-07' }),
    ]);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['', ''],
    ['2026-09-06', ''],
    ['', '2026-09-06'],
  ])('downloads independently optional bounds (%s, %s)', async (startDate, endDate) => {
    render(<DownloadParticipantDataModal onClose={() => {}} participantIds={['p1']} studyId="s1" />);
    const start = screen.getByLabelText<HTMLInputElement>(/^Start date/);
    const end = screen.getByLabelText<HTMLInputElement>(/^End date/);
    expect(start.value).toBe('');
    expect(end.value).toBe('');
    expect(start.required).toBe(false);
    expect(end.required).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Usage Events' }));
    fireEvent.change(start, { target: { value: startDate } });
    fireEvent.change(end, { target: { value: endDate } });
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Download' });
    expect(button.disabled).toBe(false);
    await act(() => fireEvent.click(button));
    expect(downloadCalls).toEqual([expect.objectContaining({ startDate, endDate, dataType: 'UsageEvents' })]);
  });

  // The server names an unnamed export; an English example name would show in every language.
  test('the optional filename field shows no untranslated placeholder', () => {
    render(<DownloadParticipantDataModal onClose={() => {}} participantIds={['p1']} studyId="s1" />);
    expect(screen.getByLabelText<HTMLInputElement>('Filename (optional)').placeholder).toBe('');
  });

  test('rejects reversed explicit dates', () => {
    render(<DownloadParticipantDataModal onClose={() => {}} participantIds={['p1']} studyId="s1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Usage Events' }));
    fireEvent.change(screen.getByLabelText(/^Start date/), { target: { value: '2026-09-07' } });
    fireEvent.change(screen.getByLabelText(/^End date/), { target: { value: '2026-09-06' } });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Download' }).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('end date');
    expect(downloadCalls).toHaveLength(0);
  });

  test('announces the pending availability request before offering export categories', () => {
    availabilityLoading = true;
    render(<DownloadParticipantDataModal onClose={() => undefined} participantIds={['p1']} studyId="s1" />);
    expect(screen.getByRole('status').textContent).toContain('Loading');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Download' }).disabled).toBe(true);
    expect(downloadCalls).toHaveLength(0);
  });
  // Every data type is exported in days of the study zone, and the dialog names it.
  test.each(['Upload Diagnostics', 'Usage Events'])('exports %s in the study time zone it names', async (label) => {
    render(<DownloadParticipantDataModal onClose={() => {}} participantIds={['p1']} studyId="s1" />);
    expect(screen.getByText(/study time zone, America\/Santiago/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: label }));
    fireEvent.change(screen.getByLabelText(/^Start date/), { target: { value: '2026-04-05' } });
    fireEvent.change(screen.getByLabelText(/^End date/), { target: { value: '2026-09-06' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(downloadCalls.at(-1)).toMatchObject({ timeZone: 'America/Santiago' });
  });
  test('cannot export before the study zone is known, and names no zone meanwhile', () => {
    studySummary = {};
    render(<DownloadParticipantDataModal onClose={() => {}} participantIds={['p1']} studyId="s1" />);
    expect(screen.getByRole('status').textContent).toContain('Loading');
    expect(screen.queryByText(/study time zone/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Usage Events' }));
    pickRange();
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Download' });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(downloadCalls).toHaveLength(0);
  });
  test.each([undefined, LOADED_STUDY.currentData])(
    'a failed study load blocks exports even with cached data %p',
    (currentData) => {
      studySummary = { currentData, isError: true, error: { status: 500, data: { message: 'study down' } } };
      render(<DownloadParticipantDataModal onClose={() => {}} participantIds={['p1']} studyId="s1" />);
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByText(/study time zone/)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Usage Events' }));
      pickRange();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Download' }).disabled).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(studyRefetches).toBe(1);
      expect(downloadCalls).toHaveLength(0);
    },
  );
  test('downloads a 400 day range', async () => {
    render(
      <DownloadParticipantDataModal onClose={() => undefined} participantIds={['participant-1']} studyId="study-1" />,
    );
    act(() => screen.getByRole('button', { name: 'Upload Diagnostics' }).click());
    fireEvent.change(screen.getByLabelText(/^Start date/), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText(/^End date/), { target: { value: '2026-02-05' } });
    act(() => screen.getByRole('button', { name: 'Download' }).click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(downloadCalls).toHaveLength(1);
    expect(downloadCalls[0]).toMatchObject({ startDate: '2025-01-01', endDate: '2026-02-05' });
  });
  test('offers every server-backed participant export category with exact wire values', async () => {
    render(
      <DownloadParticipantDataModal onClose={() => undefined} participantIds={['participant-1']} studyId="study-1" />,
    );

    for (const label of [
      'Usage Events',
      'App Usage Survey',
      'iOS Screen Time',
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
      'Upload Diagnostics',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeDefined();
    }

    act(() => screen.getByRole('button', { name: 'Device Settings' }).click());
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Download' }).disabled).toBe(false);
    pickRange();
    act(() => screen.getByRole('button', { name: 'Download' }).click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(downloadCalls.at(-1)).toMatchObject({
      dataType: 'DeviceSettings',
      endDate: '2026-09-07',
      startDate: '2026-09-01',
      studyId: 'study-1',
    });
  });

  test('offers retained diagnostics regardless of enabled collection modules', async () => {
    render(
      <DownloadParticipantDataModal onClose={() => undefined} participantIds={['participant-1']} studyId="study-1" />,
    );

    act(() => screen.getByRole('button', { name: 'Upload Diagnostics' }).click());
    pickRange();
    act(() => screen.getByRole('button', { name: 'Download' }).click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(downloadCalls.at(-1)).toMatchObject({ dataType: 'UploadDiagnostics', studyId: 'study-1' });
  });
});

test('retained export categories remain offered when collection is off', () => {
  render(<DownloadParticipantDataModal onClose={() => {}} participantIds={['p1']} studyId="s1" />);
  for (const { label } of PARTICIPANT_DATA_TYPE_OPTIONS)
    expect(screen.getByRole('button', { name: label })).toBeTruthy();
});

test('any number of selected participants can download (results stream, nothing is capped)', async () => {
  const ids = Array.from({ length: 500 }, (_, index) => `p${index}`);
  render(<DownloadParticipantDataModal onClose={() => {}} participantIds={ids} studyId="s1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Upload Diagnostics' }));
  pickRange();
  const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Download' });
  expect(button.disabled).toBe(false);
  await act(() => fireEvent.click(button));
  expect(downloadCalls.at(-1)).toMatchObject({ participantIds: ids });
});
