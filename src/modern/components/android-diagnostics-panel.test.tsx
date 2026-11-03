import { afterEach, describe, expect, jest, mock, setSystemTime, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { act, cleanup, fireEvent, render as renderDom, screen } from '@testing-library/react';
import tailwindPlugin from 'bun-plugin-tailwind';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';

const queryCalls: unknown[] = [];
const downloadCalls: unknown[] = [];
const LOADED_STUDY = { currentData: { id: 'study-1', settings: { TimeUseDiary: { timeZone: 'America/Santiago' } } } };
let studySummary: { currentData?: unknown; isError?: boolean; error?: unknown } = LOADED_STUDY;
let studyRefetches = 0;
let historyItems: unknown[] | undefined;
let downloadFailure: unknown;
let historyError = false;
let historyRefetches = 0;
let initialEntry = '/';
function SearchState() {
  return <output data-testid="search">{useLocation().search}</output>;
}
function render(ui: ReactNode) {
  return renderDom(
    <MemoryRouter initialEntries={[initialEntry]}>
      {ui}
      <SearchState />
    </MemoryRouter>,
  );
}
const studyOperationsApiModule = await import('@/state/study-operations-api');
const { LanguageProvider } = await import('@/i18n');

await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useGetStudySummaryQuery: () => ({ ...studySummary, refetch: () => void studyRefetches++ }),
  useGetAndroidDiagnosticsQuery: (args: unknown) => {
    if (JSON.stringify(queryCalls.at(-1)) !== JSON.stringify(args)) queryCalls.push(args);
    return {
      data: {
        items: historyItems ?? [
          {
            participantId: 'participant-1',
            randomDeviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            day: '2026-09-25',
            codes: [
              {
                eventId: 'event-loss',
                moduleFamily: 'SENSOR',
                issueCode: 'LOCAL_BUFFER_OVERFLOW',
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
              {
                eventId: 'event-future',
                moduleFamily: 'SENSOR',
                issueCode: 'FUTURE_ISSUE',
                occurrenceCount: 1,
                firstOccurredAt: '2026-09-25T09:09:00Z',
                lastOccurredAt: '2026-09-25T09:09:00Z',
              },
            ],
          },
        ],
        nextCursor: 'next-page-cursor',
      },
      isError: historyError,
      refetch: () => void historyRefetches++,
      isFetching: false,
      isLoading: false,
    };
  },
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
}));

const { AndroidDiagnosticsPanel } = await import('./android-diagnostics-panel');
const { formatDisplayDateTime } = await import('@/lib/format');

afterEach(() => {
  jest.useRealTimers();
  setSystemTime();
  cleanup();
  // `?lang=es` sets the module-level language that code outside React reads; put English back.
  render(<LanguageProvider initialSearch="?lang=en">{null}</LanguageProvider>);
  cleanup();
  queryCalls.length = 0;
  downloadCalls.length = 0;
  studySummary = LOADED_STUDY;
  studyRefetches = 0;
  historyItems = undefined;
  downloadFailure = undefined;
  historyError = false;
  historyRefetches = 0;
  initialEntry = '/';
});

describe('AndroidDiagnosticsPanel study zone', () => {
  test('exports diagnostics days in the study time zone', async () => {
    render(<AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />);
    fireEvent.change(screen.getByLabelText('From day'), { target: { value: '2026-09-06' } });
    fireEvent.change(screen.getByLabelText('To day'), { target: { value: '2026-09-06' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download diagnostics' }));
      await Promise.resolve();
    });
    expect(downloadCalls).toEqual([expect.objectContaining({ startDate: '2026-09-06', timeZone: 'America/Santiago' })]);
  });

  test('cannot download before the study zone is known', () => {
    studySummary = {};
    render(<AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />);
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Download diagnostics' });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(downloadCalls).toHaveLength(0);
  });

  test.each([undefined, LOADED_STUDY.currentData])(
    'a failed study load blocks downloads even with cached data %p',
    (currentData) => {
      studySummary = { currentData, isError: true, error: { status: 500, data: { message: 'study down' } } };
      render(<AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />);
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Download diagnostics' }).disabled).toBe(true);
      expect(screen.getByRole('alert')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(studyRefetches).toBe(1);
      expect(downloadCalls).toHaveLength(0);
    },
  );
});

describe('AndroidDiagnosticsPanel', () => {
  test('defaults to 30 inclusive days and accepts a 400 day range', async () => {
    render(<AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Download diagnostics' }));
    await act(async () => {
      await Promise.resolve();
    });
    const defaults = downloadCalls.at(-1) as { startDate: string; endDate: string };
    expect(queryCalls.at(-1)).toMatchObject({ fromDay: defaults.startDate, toDay: defaults.endDate });
    const start = new Date(`${defaults.startDate}T12:00:00`);
    const end = new Date(`${defaults.endDate}T12:00:00`);
    expect(Math.round((end.getTime() - start.getTime()) / 86_400_000)).toBe(29);

    fireEvent.change(screen.getByLabelText('From day'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText('To day'), { target: { value: '2026-02-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download diagnostics' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(downloadCalls).toHaveLength(2);
    expect(downloadCalls.at(-1)).toMatchObject({ startDate: '2025-01-01', endDate: '2026-02-05' });
  });
  test.each([
    { label: 'To day', value: '2026-09-30', expected: { endDate: '2026-09-30' } },
    { label: 'From day', value: '2026-09-01', expected: { startDate: '2026-09-01' } },
  ])(
    'a single $label bound downloads exactly the history range, with no synthesized other bound',
    async ({ label, value, expected }) => {
      setSystemTime(new Date('2026-10-31T12:00:00'));
      render(<AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />);
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: 'Download diagnostics' }));
      await act(async () => {
        await Promise.resolve();
      });
      const history = queryCalls.at(-1) as Record<string, unknown>;
      const download = downloadCalls.at(-1) as Record<string, unknown>;
      expect({ startDate: download.startDate, endDate: download.endDate }).toEqual({
        startDate: undefined,
        endDate: undefined,
        ...expected,
      });
      expect({ fromDay: history.fromDay, toDay: history.toDay }).toEqual({
        fromDay: download.startDate,
        toDay: download.endDate,
      });
    },
  );
  test('shows grouped history, filters pages, and downloads participant diagnostics', async () => {
    setSystemTime(new Date('2026-10-02T12:00:00'));
    jest.useFakeTimers();
    render(<AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />);

    for (const category of ['Data loss', 'Quarantined', 'Upload failures', 'App crashes', 'Collection paused']) {
      expect(screen.getByText(category)).toBeDefined();
    }
    for (const chip of [
      'Local buffer full · 4',
      'Sample quarantined · 1',
      'Connection failed · 2',
      'App crash · 1',
      'Collection paused for storage · 1',
      'Collection access missing · 1',
      // A code this build does not know keeps its raw name.
      'FUTURE_ISSUE · 1',
    ]) {
      expect(screen.getByText(chip)).toBeDefined();
    }
    expect(screen.getByRole<HTMLOptionElement>('option', { name: 'Local storage' }).value).toBe('LOCAL_STORE');
    expect(screen.getByText(/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/)).toBeDefined();

    fireEvent.change(screen.getByLabelText('From day'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('To day'), { target: { value: '2026-09-25' } });
    fireEvent.change(screen.getByLabelText('Random device ID'), {
      target: { value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    });
    fireEvent.change(screen.getByLabelText('Module family'), { target: { value: 'LOCAL_STORE' } });
    fireEvent.change(screen.getByLabelText('Issue code'), { target: { value: 'LOCAL_WRITE_FAILED' } });
    await act(() => jest.advanceTimersByTime(300));
    expect(queryCalls.at(-1)).toMatchObject({
      participantId: 'participant-1',
      studyId: 'study-1',
      fromDay: '2026-09-01',
      randomDeviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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

  // One upload issue can be reported by more than one collection module on the same day: the researcher sees it once,
  // with the summed count and the span from its earliest to its latest report.
  test('one issue reported by several modules shows once with its total count and whole span', () => {
    const report = (
      moduleFamily: string,
      occurrenceCount: number,
      firstOccurredAt: string,
      lastOccurredAt: string,
    ) => ({
      eventId: `${moduleFamily}-${firstOccurredAt}`,
      moduleFamily,
      issueCode: 'CONNECTION_FAILURE',
      occurrenceCount,
      firstOccurredAt,
      lastOccurredAt,
    });
    historyItems = [
      {
        participantId: 'participant-1',
        randomDeviceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        day: '2026-09-26',
        codes: [
          report('USAGE_LIFECYCLE', 2, '2026-09-26T10:00:00Z', '2026-09-26T10:30:00Z'),
          report('APP_RUNTIME', 3, '2026-09-26T08:00:00Z', '2026-09-26T12:00:00Z'),
          report('LOCAL_STORE', 1, '2026-09-26T09:00:00Z', '2026-09-26T09:00:00Z'),
        ],
      },
    ];
    render(<AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />);
    expect(screen.getAllByText(/^Connection failed · /).map((chip) => chip.textContent)).toEqual([
      'Connection failed · 6',
    ]);
    const first = formatDisplayDateTime('2026-09-26T08:00:00Z');
    const latest = formatDisplayDateTime('2026-09-26T12:00:00Z');
    expect(screen.getByText(`First ${first} · latest ${latest}`)).toBeDefined();
  });

  test('a failed diagnostics download tells the researcher it did not happen', async () => {
    downloadFailure = { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' };
    render(<AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download diagnostics' }));
      await Promise.resolve();
    });
    expect(downloadCalls).toHaveLength(1);
    expect((await screen.findByRole('alert')).textContent).toContain('could not reach the server');
  });

  test('names module families and issue codes in the picked language', () => {
    render(
      <LanguageProvider initialSearch="?lang=es">
        <AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />
      </LanguageProvider>,
    );
    expect(screen.getByText('Búfer local lleno · 4')).toBeDefined();
    expect(screen.getByText('Cierre inesperado de la aplicación · 1')).toBeDefined();
    expect(screen.getByText('FUTURE_ISSUE · 1')).toBeDefined();
    expect(screen.getByRole<HTMLOptionElement>('option', { name: 'Almacenamiento local' }).value).toBe('LOCAL_STORE');
    expect(screen.getByRole<HTMLOptionElement>('option', { name: 'Uso/ciclo de vida' }).value).toBe('USAGE_LIFECYCLE');
  });

  test('debounces device text filtering while inputs stay immediate and clearing remains responsive', async () => {
    jest.useFakeTimers();
    render(<AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />);

    const deviceInput = screen.getByLabelText<HTMLInputElement>('Random device ID');
    const issueInput = screen.getByLabelText<HTMLInputElement>('Issue code');
    expect(deviceInput.getAttribute('spellcheck')).toBe('false');
    expect(issueInput.getAttribute('spellcheck')).toBe('false');
    const initialQueryCount = queryCalls.length;
    fireEvent.change(deviceInput, { target: { value: 'device' } });
    fireEvent.change(deviceInput, { target: { value: 'device-42' } });
    fireEvent.change(issueInput, { target: { value: 'APP_' } });
    fireEvent.change(issueInput, { target: { value: 'APP_CRASH' } });
    expect(deviceInput.value).toBe('device-42');
    expect(issueInput.value).toBe('APP_CRASH');
    expect(queryCalls).toHaveLength(initialQueryCount);

    await act(() => jest.advanceTimersByTime(299));
    expect(queryCalls).toHaveLength(initialQueryCount);
    await act(() => jest.advanceTimersByTime(1));
    expect(queryCalls).toHaveLength(initialQueryCount + 1);
    expect(queryCalls.at(-1)).toMatchObject({ randomDeviceId: 'device-42', issueCode: 'APP_CRASH' });

    fireEvent.change(issueInput, { target: { value: '' } });
    expect(issueInput.value).toBe('');
    await act(() => jest.advanceTimersByTime(300));
    expect(queryCalls).toHaveLength(initialQueryCount + 2);
    expect(queryCalls.at(-1)).toMatchObject({ randomDeviceId: 'device-42' });
    expect(queryCalls.at(-1)).not.toHaveProperty('issueCode');
  });
});

test('diagnostics filters and cursor pages survive a shared link independently per participant', () => {
  const params = new URLSearchParams({
    'diagnostics.participant-1.from': '2026-09-01',
    'diagnostics.participant-1.to': '2026-09-30',
    'diagnostics.participant-1.device': 'device-1',
    'diagnostics.participant-1.module': 'LOCAL_STORE',
    'diagnostics.participant-1.issue': 'APP_CRASH',
    'diagnostics.participant-1.pages': new URLSearchParams([['cursor', 'cursor-2']]).toString(),
    'diagnostics.other.from': '1999-01-01',
  });
  initialEntry = `/?${params}`;
  render(<AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />);
  expect(queryCalls.at(-1)).toMatchObject({
    fromDay: '2026-09-01',
    toDay: '2026-09-30',
    randomDeviceId: 'device-1',
    moduleFamily: 'LOCAL_STORE',
    issueCode: 'APP_CRASH',
    cursor: 'cursor-2',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  const next = new URLSearchParams(screen.getByTestId('search').textContent ?? '');
  expect(new URLSearchParams(next.get('diagnostics.participant-1.pages') ?? '').getAll('cursor')).toEqual([
    'cursor-2',
    'next-page-cursor',
  ]);
  fireEvent.change(screen.getByLabelText('From day'), { target: { value: '2026-09-02' } });
  const filtered = new URLSearchParams(screen.getByTestId('search').textContent ?? '');
  expect(filtered.get('diagnostics.participant-1.from')).toBe('2026-09-02');
  expect(filtered.get('diagnostics.participant-1.pages')).toBeNull();
  expect(filtered.get('diagnostics.other.from')).toBe('1999-01-01');
});

test('diagnostics history failure announces a retry action', async () => {
  historyError = true;
  render(<AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />);
  expect(screen.getByRole('alert').textContent).toContain('Unable to load diagnostics history');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(historyRefetches).toBe(1);
  const scratch = resolve('build/operator-test-runs/L01-diagnostics');
  mkdirSync(scratch, { recursive: true });
  const built = await Bun.build({
    entrypoints: ['src/modern/styles/index.css'],
    outdir: scratch,
    plugins: [tailwindPlugin],
  });
  expect(built.success).toBe(true);
  const css = await built.outputs.find((output) => output.path.endsWith('.css'))?.text();
  expect(css).toBeDefined();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    await page.route('**/*', (route) => route.abort());
    const markup = screen.getByRole('region', { name: 'Android diagnostics history' }).outerHTML;
    await page.setContent(
      `<!doctype html><html lang="en"><head><title>Diagnostics history</title><style>${css ?? ''}</style></head><body class="bg-background p-6 text-foreground">${markup}</body></html>`,
    );
    await page.screenshot({ path: `${scratch}/desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 850 });
    await page.screenshot({ path: `${scratch}/mobile.png`, fullPage: true });
    expect(await page.getByRole('button', { name: 'Try again' }).isVisible()).toBe(true);
  } finally {
    await browser.close();
  }
});

test.each([
  ['2026-03-01', '2026-01-31'],
  ['2027-01-01', '2026-12-03'],
  ['2026-09-06', '2026-08-08'],
])('diagnostics ranges preserve all optional bounds at %s', async (today, monthAgo) => {
  setSystemTime(new Date(`${today}T12:00:00`));
  for (const fromDay of ['', '2026-01-10'])
    for (const toDay of ['', '2026-01-20']) {
      const view = render(<AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />);
      if (fromDay) fireEvent.change(screen.getByLabelText('From day'), { target: { value: fromDay } });
      if (toDay) fireEvent.change(screen.getByLabelText('To day'), { target: { value: toDay } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Download diagnostics' }));
        await Promise.resolve();
      });
      const expected =
        fromDay || toDay
          ? { fromDay: fromDay || undefined, toDay: toDay || undefined }
          : { fromDay: monthAgo, toDay: today };
      const query = queryCalls.at(-1) as Record<string, unknown>;
      const download = downloadCalls.at(-1) as Record<string, unknown>;
      expect({ fromDay: query.fromDay, toDay: query.toDay }).toEqual(expected);
      expect({ fromDay: download.startDate, toDay: download.endDate }).toEqual(expected);
      view.unmount();
    }
});

test('a panel left open across local midnight updates its history and download range', async () => {
  setSystemTime(new Date('2026-12-31T23:59:59'));
  const timer = jest.spyOn(window, 'setTimeout');
  try {
    render(<AndroidDiagnosticsPanel participantId="participant-1" studyId="study-1" />);
    expect(queryCalls.at(-1)).toMatchObject({ toDay: '2026-12-31' });
    const midnight = timer.mock.calls.find(([, delay]) => delay === 1000)?.[0];
    expect(typeof midnight).toBe('function');
    await act(async () => {
      setSystemTime(new Date('2027-01-01T00:00:00'));
      if (typeof midnight === 'function') midnight();
      await Promise.resolve();
    });
    expect(queryCalls.at(-1)).toMatchObject({ fromDay: '2026-12-03', toDay: '2027-01-01' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download diagnostics' }));
      await Promise.resolve();
    });
    expect(downloadCalls.at(-1)).toMatchObject({ startDate: '2026-12-03', endDate: '2027-01-01' });
  } finally {
    timer.mockRestore();
  }
});
