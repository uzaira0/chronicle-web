import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const downloadCalls: unknown[] = [];
const studyOperationsApiModule = await import('@/state/study-operations-api');

await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useDownloadParticipantDataMutation: () => [
    (args: unknown) => {
      downloadCalls.push(args);
      return { unwrap: () => Promise.resolve() };
    },
    { isLoading: false },
  ],
  useDownloadParticipantTudDataMutation: () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }],
}));

const { DownloadParticipantDataModal } = await import('./download-participant-data-modal');

function pickRange() {
  fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2026-09-07' } });
}

afterEach(cleanup);

describe('DownloadParticipantDataModal export coverage', () => {
  test('rejects a range over 31 days with a visible message', async () => {
    render(
      <DownloadParticipantDataModal modules={[]} onClose={() => undefined} participantIds={['participant-1']} studyId="study-1" />,
    );
    act(() => screen.getByRole('button', { name: 'Upload Diagnostics' }).click());
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2026-10-02' } });
    act(() => screen.getByRole('button', { name: 'Download' }).click());
    expect(downloadCalls).toHaveLength(0);
    expect(screen.getByText(/Choose a range of at most 31 days/)).toBeDefined();
  });
  test('offers every server-backed participant export category with exact wire values', async () => {
    render(
      <DownloadParticipantDataModal
        modules={['CHRONICLE_DATA_COLLECTION']}
        onClose={() => undefined}
        participantIds={['participant-1']}
        studyId="study-1"
      />,
    );

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
      'Upload Diagnostics',
      'Data Quality Alerts',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeDefined();
    }

    act(() => screen.getByRole('button', { name: 'Device Settings' }).click());
    expect((screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(true);
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

  test.each([
    ['ANDROID_SENSOR', 'Android Sensor'],
    ['IOS_SENSOR', 'iOS Sensor'],
  ])('preserves the %s export for studies created before unified data collection', (module, label) => {
    render(
      <DownloadParticipantDataModal
        modules={[module]}
        onClose={() => undefined}
        participantIds={['participant-1']}
        studyId="study-1"
      />,
    );

    expect(screen.getByRole('button', { name: label })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Usage Events' })).toBeNull();
  });

  test('offers retained diagnostics regardless of enabled collection modules', async () => {
    render(
      <DownloadParticipantDataModal
        modules={[]}
        onClose={() => undefined}
        participantIds={['participant-1']}
        studyId="study-1"
      />,
    );

    act(() => screen.getByRole('button', { name: 'Upload Diagnostics' }).click());
    pickRange();
    act(() => screen.getByRole('button', { name: 'Download' }).click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(downloadCalls.at(-1)).toMatchObject({ dataType: 'UploadDiagnostics', studyId: 'study-1' });
    expect(screen.getByRole('button', { name: 'Data Quality Alerts' })).toBeDefined();
  });
});
