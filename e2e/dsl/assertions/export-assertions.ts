import { expect } from '@playwright/test';

export const ExportAssertions = {
  assertCsvHasRows(bytes: Buffer, atLeast: number): void {
    const text = bytes.toString('utf-8');
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const dataRows = Math.max(0, lines.length - 1); // subtract header
    expect(dataRows).toBeGreaterThanOrEqual(atLeast);
  },
};
