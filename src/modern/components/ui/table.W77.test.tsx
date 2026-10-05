import { expect, test } from 'bun:test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

test('W77 keyboard reaches a named overflowing table, scrolls columns and passes WCAG 2.2', async () => {
  const scratch = resolve('../build/operator-test-runs/W77-browser');
  mkdirSync(scratch, { recursive: true });
  process.env.TMPDIR = scratch;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 600 } });
    const page = await context.newPage();
    await page.route('**/*', (route) => route.abort());
    const markup = renderToStaticMarkup(
      <main>
        <h1>Export jobs</h1>
        <button type="button">Before table</button>
        <Table aria-label="Recent export jobs" style={{ minWidth: 900 }}>
          <TableHeader><TableRow><TableHead>Created</TableHead><TableHead>Status</TableHead><TableHead>Download</TableHead></TableRow></TableHeader>
          <TableBody><TableRow><TableCell>October 3</TableCell><TableCell>Ready</TableCell><TableCell>CSV</TableCell></TableRow></TableBody>
        </Table>
        <button type="button">After table</button>
      </main>,
    );
    // A controlled overflow fixture uses the existing wrapper's sizing utilities.
    await page.setContent(`<!doctype html><html lang="en"><head><title>Export jobs</title><style>
      body { font:16px sans-serif; color:#111; background:#fff; } main { width:350px; max-width:100%; }
      .eq-table-wrap { width:100%; max-width:100%; overflow:auto; } table { border-collapse:collapse; }
      th, td { min-width:280px; text-align:left; padding:12px; }
      .eq-table-wrap[class~="focus-visible:outline-2"]:focus-visible { outline:2px solid currentColor; }
      .eq-table-wrap[class~="focus-visible:outline-offset-2"]:focus-visible { outline-offset:2px; }
    </style></head><body>${markup}</body></html>`);
    const region = page.getByRole('region', { name: 'Recent export jobs' });
    expect(await region.count()).toBe(1);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await region.evaluate((node) => document.activeElement === node)).toBe(true);
    expect(await region.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => (document.querySelector('.eq-table-wrap')?.scrollLeft ?? 0) > 0);
    expect(await region.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe('none');
    expect(await region.evaluate((node) => getComputedStyle(node).outlineOffset)).toBe('2px');
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(audit.violations.map((v) => v.id)).toEqual([]);
    const gate = readFileSync(resolve('e2e/accessibility.spec.ts'), 'utf8');
    expect(gate).toContain('wcag22aa');
    expect(gate).toContain('seedAuthenticatedTableRoutes');
  } finally {
    await browser.close();
  }
}, 20_000);
