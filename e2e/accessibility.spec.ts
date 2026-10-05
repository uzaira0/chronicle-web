import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures/browser-test';
import { expectAppRendered } from './fixtures/app-ready';
import { SESSION_PATH, STABLE_AUTHENTICATED_SESSION } from './dsl/constants';

/**
 * Axe-core accessibility scans for Chronicle pages.
 *
 * These tests catch WCAG 2.2 Level A/AA violations at runtime that
 * the static biome a11y rules cannot detect (color contrast, focus order,
 * ARIA attribute correctness on rendered DOM, etc.).
 *
 * The app requires SSO authentication for most data-bearing pages.
 * Unauthenticated tests cover the shell chrome, login/landing state,
 * and participant-facing public routes. Authenticated table scans use
 * explicit synthetic API responses and a stable authenticated session.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run an axe scan and return the violations array. */
async function scanPage(page: import('@playwright/test').Page, disableRules: string[] = []) {
  const builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
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
// Authenticated tables — fixture-backed data, including mobile overflow
// ---------------------------------------------------------------------------

async function seedAuthenticatedTableRoutes(page: import('@playwright/test').Page) {
  await page.route(`**${SESSION_PATH}`, (route) => route.fulfill({
    json: STABLE_AUTHENTICATED_SESSION,
  }));
  const studyId = 'a11y-study';
  const fixtures: Record<string, unknown> = {
    [`/study/${studyId}`]: {
      id: studyId, title: 'Accessibility study', contact: 'fixture@example.invalid',
      modules: { CHRONICLE_DATA_COLLECTION: {}, CHRONICLE_SURVEYS: {} },
      settings: {}, notificationsEnabled: false, version: '1',
    },
    [`/study/${studyId}/lifecycle`]: 'ACTIVE',
    [`/study/${studyId}/settings/type/DataCollection`]: { modules: {}, version: 1 },
    [`/survey/${studyId}/questionnaire`]: [],
    [`/study/${studyId}/export`]: [{
      exportId: 'fixture-export-with-a-long-id', studyId, createdAt: '2026-10-03T12:00:00Z',
      status: 'COMPLETED', format: 'CSV', rowCount: 1,
    }],
    [`/study/${studyId}/settings/audit`]: [{
      id: 'fixture-audit', studyId, changedAt: '2026-10-03T12:00:00Z',
      changedBy: 'Fixture researcher', settingKey: 'DataCollection',
      changeSummary: 'Changed a fixture setting', beforeValue: {}, afterValue: { version: 1 },
    }],
    [`/study/${studyId}/settings/acknowledgments`]: [{
      id: 'fixture-consent', studyId, participantId: 'fixture-participant',
      sourceDeviceId: 'fixture-device', acknowledgedAt: '2026-10-03T12:00:00Z',
      recordedAt: '2026-10-03T12:00:01Z', acknowledgedModules: ['APP_USAGE'],
      declinedModules: ['LOCATION'], trigger: 'ENROLLMENT',
    }],
    [`/study/${studyId}/api-keys`]: [],
    '/authorizations': [],
  };
  // Unknown API calls fail visibly instead of reaching a backend or receiving an
  // unrelated empty success response. The fixture also covers paginated queries.
  await page.route('**/chronicle/api/web/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/chronicle/api/web', '');
    const known = Object.hasOwn(fixtures, path);
    return route.fulfill({ status: known ? 200 : 404, json: known ? fixtures[path] : { error: 'Unseeded fixture route' } });
  });
}

test.describe('accessibility — authenticated tables', () => {
  test.use({ viewport: { height: 844, width: 390 } });
  test.beforeEach(async ({ page }) => seedAuthenticatedTableRoutes(page));

  for (const route of [
    { path: 'downloads', table: 'Recent export jobs' },
    { path: 'settings-audit', table: 'Settings audit' },
  ]) {
    test(`${route.path} table has no WCAG 2.2 violations`, async ({ page }) => {
      await page.goto(`/studies/a11y-study/${route.path}`);
      const table = page.getByRole('region', { name: route.table, exact: true });
      await expect(table).toBeVisible();
      await expect(table.getByRole('cell').first()).toBeVisible();
      // The wrapper is reachable without a mouse and exposes its purpose.
      await table.focus();
      await expect(table).toBeFocused();
      const results = await scanPage(page);
      expect(results.violations, formatViolations(results.violations)).toEqual([]);
    });
  }
});
