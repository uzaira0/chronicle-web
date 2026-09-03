import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, render, screen } from '@testing-library/react';

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

afterEach(cleanup);

describe('DownloadParticipantDataModal export coverage', () => {
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
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeDefined();
    }

    act(() => screen.getByRole('button', { name: 'Device Settings' }).click());
    act(() => screen.getByRole('button', { name: 'Download' }).click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(downloadCalls.at(-1)).toMatchObject({ dataType: 'DeviceSettings', studyId: 'study-1' });
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
});
