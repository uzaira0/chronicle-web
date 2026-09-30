import { describe, expect, test } from 'bun:test';

describe.each(['America/Santiago', 'Asia/Tokyo'])('calendar dates in %s', (timeZone) => {
  test('keeps date-only calendar fields and displays offset date-times as local instants', async () => {
    const dates = ['2024-01-01', '2024-02-29', '2026-09-06', '0001-01-01'];
    const instants = ['2024-01-01T00:00:00Z', '2024-12-31T23:59:59Z', '2024-03-15T00:00:00+05:30'];
    const script = `
      import { formatDisplayDate, formatDisplayDateTime, parseDisplayDate } from ${JSON.stringify(new URL('./format.ts', import.meta.url).pathname)};
      const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
      const timeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      console.log(JSON.stringify({
        dates: ${JSON.stringify(dates)}.map(value => {
          const parsed = parseDisplayDate(value);
          const local = new Date(value + 'T00:00:00');
          return {
            fields: [parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()],
            date: formatDisplayDate(value), expectedDate: dateFormatter.format(local),
            time: formatDisplayDateTime(value), expectedTime: timeFormatter.format(local),
          };
        }),
        instants: ${JSON.stringify(instants)}.map(value => ({
          timestamp: parseDisplayDate(value).getTime(), expectedTimestamp: Date.parse(value),
          date: formatDisplayDate(value), expectedDate: dateFormatter.format(new Date(value)),
          time: formatDisplayDateTime(value), expectedTime: timeFormatter.format(new Date(value)),
        })),
      }));
    `;
    const child = Bun.spawn([process.execPath, '--eval', script], {
      env: { ...process.env, TZ: timeZone },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    expect(stderr).toBe('');
    expect(exitCode).toBe(0);
    const results = JSON.parse(stdout) as {
      dates: { fields: number[]; date: string; expectedDate: string; time: string; expectedTime: string }[];
      instants: { timestamp: number; expectedTimestamp: number; date: string; expectedDate: string; time: string; expectedTime: string }[];
    };
    for (const [index, result] of results.dates.entries()) {
      expect(result.fields).toEqual(dates[index]!.split('-').map(Number));
      expect(result.date).toBe(result.expectedDate);
      expect(result.time).toBe(result.expectedTime);
    }
    for (const result of results.instants) {
      expect(result.timestamp).toBe(result.expectedTimestamp);
      expect(result.date).toBe(result.expectedDate);
      expect(result.time).toBe(result.expectedTime);
    }
  });
});
