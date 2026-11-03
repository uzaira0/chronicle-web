import { expect, test } from 'bun:test';
import windows from '@/generated/participant-form-windows.json';
import { toExportDateTime } from './study-operations-api';

test.each(windows)('keeps the participant offsets for $day in $zone', ({ day, zone, start, end, hours }) => {
  expect(toExportDateTime(day, false, zone)).toBe(start);
  expect(toExportDateTime(day, true, zone)).toBe(end);
  expect((Date.parse(end) - Date.parse(start)) / 3_600_000).toBe(hours);
});
