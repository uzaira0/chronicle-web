import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import tailwindPlugin from 'bun-plugin-tailwind';

// A focused control under the sticky application header must scroll clear of it. Built with the production
// CSS pipeline and measured in a real browser, so the test follows the stylesheet's behaviour, not its text.
describe('sticky application header scroll spacing', () => {
  const previousTmpdir = process.env.TMPDIR;
  afterEach(() => {
    if (previousTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previousTmpdir;
  });
  test('gives focused main-content targets scroll margin below the shell header', async () => {
    const scratch = resolve('build/operator-test-runs/header-scroll-margin-browser');
    mkdirSync(scratch, { recursive: true });
    process.env.TMPDIR = scratch;
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
      const page = await browser.newPage();
      await page.route('**/*', (route) => route.abort());
      await page.setContent(`<!doctype html><html lang="en"><head><title>Header scroll margin</title><style>${css ?? ''}</style></head>
        <body><div class="eq-app-shell"><header>Chronicle</header><main><h1 tabindex="-1">Study</h1>
        <a href="#x">Participants</a><button type="button">Save</button><input aria-label="Search"></main>
        <aside><button type="button">Outside main</button></aside></div></body></html>`);
      const margins = await page.evaluate(() =>
        [...document.querySelectorAll('main, main h1, main a, main button, main input, aside button')].map(
          (node) => getComputedStyle(node).scrollMarginBlockStart,
        ),
      );
      const rem = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
      const clearance = `${4 * rem + 0.5 * rem}px`;
      expect(margins).toEqual([clearance, clearance, clearance, clearance, clearance, '0px']);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
