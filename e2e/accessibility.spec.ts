import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures/browser-test';
import { expectAppRendered } from './fixtures/app-ready';

/**
 * Axe-core accessibility scans for Chronicle pages.
 *
 * These tests catch WCAG 2.1 Level A/AA violations at runtime that
 * eslint-plugin-jsx-a11y cannot detect (color contrast, focus order,
 * ARIA attribute correctness on rendered DOM, etc.).
 *
 * The app requires SSO authentication for most data-bearing pages.
 * Unauthenticated tests cover the shell chrome, login/landing state,
 * and participant-facing public routes. Authenticated page tests are
 * marked with a TODO for when a test-harness JWT is available.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run an axe scan and return the violations array. */
async function scanPage(page: import('@playwright/test').Page, disableRules: string[] = []) {
  const builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .disableRules([
      // color-contrast can be noisy in dark-mode theming layers —
      // enable once the design tokens are finalized.
      // 'color-contrast',
      ...disableRules,
    ]);

  return builder.analyze();
}

/** Format violations into a readable string for test failure output. */
function formatViolations(violations: import('axe-core').Result[]) {
  return violations
    .map((v) => {
      const nodes = v.nodes
        .map((n) => `    - ${n.html}\n      ${n.failureSummary}`)
        .join('\n');
      return `[${v.impact}] ${v.id}: ${v.help}\n  (${v.helpUrl})\n${nodes}`;
    })
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Unauthenticated pages
// ---------------------------------------------------------------------------

const unauthenticatedRoutes: { name: string; path: string }[] = [
  { name: 'landing / overview page', path: '/' },
  { name: 'dashboard route', path: '/dashboard' },
  { name: 'questionnaire route', path: '/questionnaire' },
  { name: 'survey route', path: '/survey' },
  { name: 'time-use-diary route', path: '/time-use-diary' },
  { name: 'participant dashboard', path: '/participant' },
  { name: '404 / not-found page', path: '/this-page-does-not-exist' },
];

test.describe('accessibility — unauthenticated pages', () => {
  for (const route of unauthenticatedRoutes) {
    test(`${route.name} has no critical a11y violations`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
      await expectAppRendered(page);

      const results = await scanPage(page);
      expect(results.violations, formatViolations(results.violations)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Dark mode — re-scan the landing page with the alternate theme
// ---------------------------------------------------------------------------

test.describe('accessibility — dark mode', () => {
  test('landing page in dark mode has no a11y violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    await expectAppRendered(page);

    // Toggle to dark mode via the theme menu
    const themeToggle = page.getByLabel('Toggle theme').filter({ visible: true }).first();
    await expect(themeToggle).toBeVisible({ timeout: 5_000 });
    await themeToggle.click();
    await page.getByRole('menuitem', { name: 'Dark' }).click();
    // Wait for class change to propagate
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(true);

    const results = await scanPage(page);
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Mobile viewport — sidebar / hamburger menu state
// ---------------------------------------------------------------------------

test.describe('accessibility — mobile viewport', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('mobile landing page has no a11y violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    await expectAppRendered(page);

    const results = await scanPage(page);
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });

  test('mobile nav overlay has no a11y violations when open', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    await expectAppRendered(page);

    const menuButton = page.getByLabel('Open navigation');
    await expect(menuButton).toBeVisible({ timeout: 5_000 });
    await menuButton.click();
    // Give the overlay animation time to settle
    await page.waitForTimeout(300);

    const results = await scanPage(page);
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TODO: Authenticated page scans
// ---------------------------------------------------------------------------
// When a stable test JWT or testing-login fixture is available, add scans for:
//   - /studies (study list)
//   - /studies/:studyId (study detail tabs: participants, compliance, questionnaires, etc.)
//
// Example using the auth fixture:
//
//   import { test as authTest, expect as authExpect } from './fixtures/auth';
//
//   authTest('studies page has no a11y violations', async ({ authenticatedPage }) => {
//     await authenticatedPage.goto('/studies');
//     await authenticatedPage.waitForLoadState('networkidle');
//     const results = await scanPage(authenticatedPage);
//     authExpect(results.violations, formatViolations(results.violations)).toEqual([]);
//   });
