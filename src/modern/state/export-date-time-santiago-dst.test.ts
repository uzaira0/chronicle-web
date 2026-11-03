import { expect, test } from 'bun:test';
import { toExportDateTime } from './study-operations-api';

// Both sides of the 2026 America/Santiago clock changes
// (fall-back at the end of 4 April, spring-forward at the start of 6 September), in whatever
// zone the researcher's browser runs.
const SANTIAGO_DAYS: [string, string, string, number][] = [
  ['2026-04-03', '2026-04-03T00:00:00.000-03:00', '2026-04-04T00:00:00.000-03:00', 24],
  ['2026-04-04', '2026-04-04T00:00:00.000-03:00', '2026-04-05T00:00:00.000-04:00', 25],
  ['2026-04-05', '2026-04-05T00:00:00.000-04:00', '2026-04-06T00:00:00.000-04:00', 24],
  ['2026-09-05', '2026-09-05T00:00:00.000-04:00', '2026-09-06T00:00:00.000-04:00', 24],
  ['2026-09-06', '2026-09-06T01:00:00.000-03:00', '2026-09-07T00:00:00.000-03:00', 23],
  ['2026-09-07', '2026-09-07T00:00:00.000-03:00', '2026-09-08T00:00:00.000-03:00', 24],
];
test.each(SANTIAGO_DAYS)('Santiago day %s spans %s to %s', (day, start, end, hours) => {
  expect(toExportDateTime(day, false, 'America/Santiago')).toBe(start);
  expect(toExportDateTime(day, true, 'America/Santiago')).toBe(end);
  expect((Date.parse(end) - Date.parse(start)) / 3_600_000).toBe(hours);
});

// The export bounds a browser ahead of or behind the study sends are still Santiago's. Each
// browser zone runs in its own process, because the runtime fixes its default zone at first use.
test.each(['Asia/Tokyo', 'America/Los_Angeles'])(
  'a browser in %s sends the Santiago day bounds',
  async (browserZone) => {
    const script = `
    import { toExportDateTime } from ${JSON.stringify(new URL('./study-operations-api.ts', import.meta.url).pathname)};
    console.log(JSON.stringify({
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      bounds: ${JSON.stringify(SANTIAGO_DAYS.map(([day]) => day))}.map((day) => [
        toExportDateTime(day, false, 'America/Santiago'),
        toExportDateTime(day, true, 'America/Santiago'),
      ]),
    }));
  `;
    const child = Bun.spawn([process.execPath, '--eval', script], {
      env: { ...process.env, TZ: browserZone },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(stderr).toBe('');
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout) as { zone: string; bounds: string[][] };
    expect(result.zone).toBe(browserZone);
    expect(result.bounds).toEqual(SANTIAGO_DAYS.map(([, start, end]) => [start, end]));
  },
);

test('consecutive Santiago days tile the timeline with no gap or overlap across both changes', () => {
  const days = ['2026-04-03', '2026-04-04', '2026-04-05', '2026-09-05', '2026-09-06', '2026-09-07'];
  for (let i = 0; i + 1 < days.length; i += 1) {
    const [day, next] = [days[i] as string, days[i + 1] as string];
    if (Date.parse(`${next}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`) !== 86_400_000) continue;
    expect(Date.parse(toExportDateTime(day, true, 'America/Santiago'))).toBe(
      Date.parse(toExportDateTime(next, false, 'America/Santiago')),
    );
  }
});
