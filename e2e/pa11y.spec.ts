import AxeBuilder from '@axe-core/playwright';
import { formatAxeViolations, WCAG_SMOKE_ROUTES, WCAG_TAGS } from './dsl/wcag-audit';
import { expectAppRendered } from './fixtures/app-ready';
import { expect, test } from './fixtures/browser-test';

/**
 * Public-route WCAG accessibility smoke tests.
 *
 * Uses the same Playwright browser session as the rest of the E2E suite and the
 * already-pinned Axe integration. This avoids a second Chromium downloader while
 * retaining the retired pa11y gate's home/login route coverage and A/AA rulesets.
 */

test.describe('Public route WCAG accessibility audit', () => {
  test.describe.configure({ mode: 'serial' });

  for (const route of WCAG_SMOKE_ROUTES) {
    test(`Axe scan: ${route}`, async ({ page }) => {
      await page.goto(route);
      await expectAppRendered(page);

      const results = await new AxeBuilder({ page })
        .include('main, [role="main"]')
        .withTags([...WCAG_TAGS])
        .analyze();

      expect(results.violations, formatAxeViolations(results.violations)).toEqual([]);
    });
  }
});
