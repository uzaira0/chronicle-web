import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { Result } from 'axe-core';
import { APP_USAGE_FREQUENCIES, type AppUsageFrequency } from '../src/modern/generated/chronicle-contracts';
import { PARTICIPANT_CONTEXT_STORAGE_KEY, PARTICIPANT_CSRF_STORAGE_KEY } from '../src/modern/lib/participant-access';
import { SESSION_PATH, STABLE_AUTHENTICATED_SESSION } from './dsl/constants';
import { expectAppRendered } from './fixtures/app-ready';
import { expect, test } from './fixtures/browser-test';
import { seedStudyRoutes } from './fixtures/study-api';

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
async function scanPage(page: Page, disableRules: string[] = []) {
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
function formatViolations(violations: Result[]) {
  return violations
    .map((v) => {
      const nodes = v.nodes.map((n) => `    - ${n.html}\n      ${n.failureSummary}`).join('\n');
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

test.describe('accessibility — participant instruments', () => {
  const studyId = 'a11y-study';
  const participantId = 'a11y-participant';
  const questionnaireId = 'a11y-questionnaire';
  const date = '2026-10-03';
  const surveyControls: Record<AppUsageFrequency, (page: Page) => Promise<void>> = {
    DAILY: async (page) => {
      await expect(page.getByRole('checkbox', { name: 'Parent alone', exact: true })).toBeVisible();
    },
    HOURLY: async (page) => {
      await page.getByRole('button', { name: 'Begin survey', exact: true }).click();
      await expect(page.getByRole('checkbox', { name: /Fixture app/i })).toBeVisible();
    },
  };
  const instruments = [
    ...(['questionnaire', 'time-use-diary', 'participant'] as const).map((instrument) => ({
      instrument,
      frequency: APP_USAGE_FREQUENCIES[0],
    })),
    ...APP_USAGE_FREQUENCIES.map((frequency) => ({ instrument: 'survey' as const, frequency })),
  ];
  function instrumentResponses(frequency: (typeof APP_USAGE_FREQUENCIES)[number]): Record<string, unknown> {
    return {
      [`/survey/${studyId}/questionnaire/${questionnaireId}`]: {
        id: questionnaireId,
        title: 'Fixture questionnaire',
        questions: [
          { title: 'How do you feel?', choices: [] },
          { title: 'How often?', choices: ['Daily', 'Weekly'] },
        ],
      },
      [`/survey/${studyId}/app-usage-frequency`]: { appUsageFrequency: frequency },
      // The server lists the ended survey days, then serves the opened day's apps in answer blocks.
      [`/survey/${studyId}/participant/${participantId}/app-usage/days`]: {
        timeZone: 'UTC',
        today: '2026-10-04',
        days: [{ date, state: 'UNANSWERED' }],
      },
      [`/survey/${studyId}/participant/${participantId}/app-usage`]: {
        date,
        timeZone: 'UTC',
        state: 'UNANSWERED',
        apps: [
          {
            appPackageName: 'org.chronicle.fixture',
            appLabel: 'Fixture app',
            blocks: [
              frequency === 'HOURLY'
                ? { start: `${date}T12:00:00Z`, end: `${date}T13:00:00Z` }
                : { start: `${date}T00:00:00Z`, end: '2026-10-04T00:00:00Z' },
            ],
          },
        ],
      },
      [`/time-use-diary/${studyId}/settings`]: {
        language: 'en',
        clockFormat: 24,
        clockFormatLocked: true,
        enableChangesForOhioStateUniversity: true,
        enableChangesForSherbrookeUniversity: true,
      },
      [`/time-use-diary/${studyId}/participant/${participantId}`]: { [date]: ['fixture-submission'] },
    };
  }

  async function seedInstrument(page: Page, frequency: (typeof APP_USAGE_FREQUENCIES)[number]): Promise<void> {
    await page.addInitScript(
      ({ contextKey, csrfKey, studyId, participantId, questionnaireId }) => {
        const context = {
          csrfToken: 'fixture-csrf',
          expiresAt: '2099-01-01T00:00:00Z',
          formKind: 'PORTAL',
          studyId,
          participantId,
          resourceId: questionnaireId,
        };
        sessionStorage.setItem(contextKey, JSON.stringify(context));
        sessionStorage.setItem(csrfKey, context.csrfToken);
      },
      {
        contextKey: PARTICIPANT_CONTEXT_STORAGE_KEY,
        csrfKey: PARTICIPANT_CSRF_STORAGE_KEY,
        studyId,
        participantId,
        questionnaireId,
      },
    );
    const responses = instrumentResponses(frequency);
    await page.route('**/chronicle/v3/**', (route) => {
      const path = new URL(route.request().url()).pathname.replace('/chronicle/v3', '');
      return route.fulfill({
        status: Object.hasOwn(responses, path) ? 200 : 404,
        json: responses[path] ?? { error: 'Unseeded participant route' },
      });
    });
  }

  for (const { instrument, frequency } of instruments) {
    test(`${instrument} ${frequency} renders its controls before the WCAG scan`, async ({ page }) => {
      await seedInstrument(page, frequency);
      await page.goto(
        `/${instrument}?studyId=${studyId}&participantId=${participantId}&questionnaireId=${questionnaireId}&date=${date}`,
      );
      if (instrument === 'questionnaire') {
        await expect(page.getByRole('textbox', { name: /Answer to question 1/i })).toBeVisible();
        await expect(page.getByRole('checkbox', { name: 'Daily', exact: true })).toBeVisible();
      } else if (instrument === 'survey') {
        await surveyControls[frequency](page);
      } else if (instrument === 'time-use-diary') {
        await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeEnabled();
        await expect(page.locator('input, [role="radio"], [role="combobox"]').first()).toBeVisible();
      } else {
        await expect(page.getByRole('link', { name: /Submit.*diary/i })).toBeVisible();
        await expect(page.getByText('submission id: fixture-submission', { exact: true })).toBeVisible();
      }
      const results = await scanPage(page);
      expect(results.violations, formatViolations(results.violations)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Dark mode — re-scan the landing page with the alternate theme
// ---------------------------------------------------------------------------

test.describe('accessibility — dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await seedStudyRoutes(page);
    await page.route(`**${SESSION_PATH}`, (route) => route.fulfill({ json: STABLE_AUTHENTICATED_SESSION }));
  });
  test('landing page in dark mode has no a11y violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    await expectAppRendered(page);

    // The theme menu belongs to the authenticated shell.
    const themeToggle = page.getByLabel('Toggle theme').filter({ visible: true }).first();
    await expect(themeToggle).toBeVisible({ timeout: 5_000 });
    await themeToggle.click();
    await page.getByRole('menuitem', { name: 'Dark' }).click();
    // Wait for class change to propagate
    await expect.poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);

    const results = await scanPage(page);
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Mobile viewport — sidebar / hamburger menu state
// ---------------------------------------------------------------------------

test.describe('accessibility — mobile viewport', () => {
  test.beforeEach(async ({ page }) => {
    await seedStudyRoutes(page);
    await page.route(`**${SESSION_PATH}`, (route) => route.fulfill({ json: STABLE_AUTHENTICATED_SESSION }));
  });
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
  await page.route(`**${SESSION_PATH}`, (route) =>
    route.fulfill({
      json: STABLE_AUTHENTICATED_SESSION,
    }),
  );
  const studyId = 'a11y-study';
  const fixtures: Record<string, unknown> = {
    [`/study/${studyId}`]: {
      id: studyId,
      title: 'Accessibility study',
      contact: 'fixture@example.invalid',
      modules: { CHRONICLE_DATA_COLLECTION: {}, CHRONICLE_SURVEYS: {} },
      settings: {},
      version: '1',
    },
    [`/study/${studyId}/lifecycle`]: 'ACTIVE',
    [`/study/${studyId}/settings/type/DataCollection`]: { modules: {}, version: 1 },
    [`/survey/${studyId}/questionnaire`]: [
      { id: 'fixture-questionnaire', title: 'Fixture questionnaire', active: true, questions: [{ title: 'How?' }] },
    ],
    [`/study/${studyId}/export/availability`]: { dataTypes: ['UsageEvents'], timeUseDiary: true },
    [`/study/${studyId}/settings/audit`]: [
      {
        id: 'fixture-audit',
        studyId,
        changedAt: '2026-10-03T12:00:00Z',
        changedBy: 'Fixture researcher',
        settingKey: 'DataCollection',
        changeSummary: 'Changed a fixture setting',
        beforeValue: {},
        afterValue: { version: 1 },
      },
    ],
    [`/study/${studyId}/settings/acknowledgments`]: [
      {
        id: 'fixture-consent',
        studyId,
        participantId: 'fixture-participant',
        sourceRandomDeviceId: 'fixture-device',
        acknowledgedAt: '2026-10-03T12:00:00Z',
        recordedAt: '2026-10-03T12:00:01Z',
        acknowledgedModules: ['APP_USAGE'],
        declinedModules: ['LOCATION'],
        trigger: 'ENROLLMENT',
      },
    ],
    [`/study/${studyId}/api-keys`]: [],
    '/authorizations': [],
  };
  // Unknown API calls fail visibly instead of reaching a backend or receiving an
  // unrelated empty success response. The fixture also covers paginated queries.
  await page.route('**/chronicle/api/web/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/chronicle/api/web', '');
    const known = Object.hasOwn(fixtures, path);
    return route.fulfill({
      status: known ? 200 : 404,
      json: known ? fixtures[path] : { error: 'Unseeded fixture route' },
    });
  });
}

test.describe('accessibility — authenticated tables', () => {
  test.use({ viewport: { height: 844, width: 390 } });
  test.beforeEach(async ({ page }) => seedAuthenticatedTableRoutes(page));

  test('settings-audit table has no WCAG 2.2 violations', async ({ page }) => {
    await page.goto('/studies/a11y-study/settings-audit');
    const table = page.getByRole('region', { name: 'Settings audit', exact: true });
    await expect(table).toBeVisible();
    await expect(table.getByRole('cell').first()).toBeVisible();
    // The wrapper is reachable without a mouse and exposes its purpose.
    await table.focus();
    await expect(table).toBeFocused();
    const results = await scanPage(page);
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });

  // Downloads stream directly; the page holds the Time Use Diary range form and the questionnaire list.
  test('downloads page has no WCAG 2.2 violations', async ({ page }) => {
    await page.goto('/studies/a11y-study/downloads');
    await expect(page.getByRole('heading', { name: 'Time use diary', exact: true })).toBeVisible();
    await expect(page.getByLabel('Start date')).toBeVisible();
    await expect(page.getByText('Fixture questionnaire', { exact: true })).toBeVisible();
    const results = await scanPage(page);
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });
});
