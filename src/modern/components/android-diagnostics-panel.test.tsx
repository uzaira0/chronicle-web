import { afterEach, describe, expect, mock, setSystemTime, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const queryCalls: unknown[] = [];
const downloadCalls: unknown[] = [];
const studyOperationsApiModule = await import('@/state/study-operations-api');

await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useGetAndroidDiagnosticsQuery: (args: unknown) => {
    queryCalls.push(args);
    return {
      data: {
        items: [
          {
            participantId: 'participant-1',
            deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            day: '2026-09-25',
            codes: [
              {
                eventId: 'event-loss',
                moduleFamily: 'SENSOR',
                issueCode: 'SENSOR_CAPACITY_DROPPED',
                occurrenceCount: 4,
                firstOccurredAt: '2026-09-25T09:00:00Z',
                lastOccurredAt: '2026-09-25T09:02:00Z',
              },
              {
                eventId: 'event-quarantine',
                moduleFamily: 'LOCAL_STORE',
                issueCode: 'SAMPLE_QUARANTINED',
                occurrenceCount: 1,
                firstOccurredAt: '2026-09-25T09:03:00Z',
                lastOccurredAt: '2026-09-25T09:03:00Z',
              },
              {
                eventId: 'event-upload',
                moduleFamily: 'APP_RUNTIME',
                issueCode: 'CONNECTION_FAILURE',
                occurrenceCount: 2,
                firstOccurredAt: '2026-09-25T09:04:00Z',
                lastOccurredAt: '2026-09-25T09:05:00Z',
              },
              {
                eventId: 'event-crash',
                moduleFamily: 'APP_RUNTIME',
                issueCode: 'APP_CRASH',
                occurrenceCount: 1,
                firstOccurredAt: '2026-09-25T09:06:00Z',
                lastOccurredAt: '2026-09-25T09:06:00Z',
              },
              {
                eventId: 'event-paused',
                moduleFamily: 'LOCAL_STORE',
                issueCode: 'COLLECTION_PAUSED_STORAGE',
                occurrenceCount: 1,
                firstOccurredAt: '2026-09-25T09:07:00Z',
                lastOccurredAt: '2026-09-25T09:07:00Z',
              },
              {
                eventId: 'event-access',
                moduleFamily: 'INTERACTION',
                issueCode: 'COLLECTION_ACCESS_MISSING',
                occurrenceCount: 1,
                firstOccurredAt: '2026-09-25T09:08:00Z',
                lastOccurredAt: '2026-09-25T09:08:00Z',
              },
            ],
          },
          {
            participantId: 'participant-1',
            day: '2026-09-24',
            codes: [],
            dataQualityAlert: {
              alertId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              alertType: 'LOW_QUALITY',
              score: 22.5,
              createdAt: '2026-09-24T12:00:00Z',
            },
          },
        ],
        nextCursor: 'next-page-cursor',
      },
      isError: false,
      isFetching: false,
      isLoading: false,
    };
  },
  useDownloadParticipantDataMutation: () => [
    (args: unknown) => {
      downloadCalls.push(args);
      return { unwrap: () => Promise.resolve() };
    },
    { isLoading: false },
  ],
}));

const { AndroidDiagnosticsPanel } = await import('./android-diagnostics-panel');

afterEach(() => {
  setSystemTime();
  cleanup();
  queryCalls.length = 0;
  downloadCalls.length = 0;
});

describe('AndroidDiagnosticsPanel', () => {
  test('defaults to 30 inclusive days and rejects a range over 31 days', async () => {
    render(<AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Download diagnostics' }));
    await act(async () => {
      await Promise.resolve();
    });
    const defaults = downloadCalls.at(-1) as { startDate: string; endDate: string };
    const start = new Date(`${defaults.startDate}T12:00:00`);
    const end = new Date(`${defaults.endDate}T12:00:00`);
    expect(Math.round((end.getTime() - start.getTime()) / 86_400_000)).toBe(29);

    fireEvent.change(screen.getByLabelText('From day'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('To day'), { target: { value: '2026-10-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download diagnostics' }));
    expect(downloadCalls).toHaveLength(1);
    expect(screen.getByText(/Choose a range of at most 31 days/)).toBeDefined();
  });
  test('shows grouped full history, filters pages, and downloads participant diagnostics', async () => {
    setSystemTime(new Date('2026-10-02T12:00:00'));
    render(<AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />);

    for (const category of ['Data loss', 'Quarantined', 'Upload failures', 'App crashes', 'Collection paused']) {
      expect(screen.getByText(category)).toBeDefined();
    }
    for (const code of [
      'SENSOR_CAPACITY_DROPPED',
      'SAMPLE_QUARANTINED',
      'CONNECTION_FAILURE',
      'APP_CRASH',
      'COLLECTION_PAUSED_STORAGE',
      'COLLECTION_ACCESS_MISSING',
      'LOW_QUALITY',
    ]) {
      expect(screen.getByText(new RegExp(code))).toBeDefined();
    }
    expect(screen.getByText(/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/)).toBeDefined();

    fireEvent.change(screen.getByLabelText('From day'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('To day'), { target: { value: '2026-09-25' } });
    fireEvent.change(screen.getByLabelText('Device ID'), {
      target: { value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    });
    fireEvent.change(screen.getByLabelText('Module family'), { target: { value: 'LOCAL_STORE' } });
    fireEvent.change(screen.getByLabelText('Issue code'), { target: { value: 'LOCAL_WRITE_FAILED' } });
    expect(queryCalls.at(-1)).toMatchObject({
      participantId: 'participant-1',
      studyId: 'study-1',
      fromDay: '2026-09-01',
      deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      moduleFamily: 'LOCAL_STORE',
      issueCode: 'LOCAL_WRITE_FAILED',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(queryCalls.at(-1)).toMatchObject({ cursor: 'next-page-cursor' });
    fireEvent.click(screen.getByRole('button', { name: 'Download diagnostics' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(downloadCalls.at(-1)).toMatchObject({
      dataType: 'UploadDiagnostics',
      participantIds: ['participant-1'],
      startDate: '2026-09-01',
      studyId: 'study-1',
    });
    expect((downloadCalls.at(-1) as { endDate?: string }).endDate).toBe('2026-09-25');
  });
});
