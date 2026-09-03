import {
  SESSION_PATH,
  STABLE_AUTHENTICATED_SESSION,
} from './dsl/constants';
import { expectAppRendered } from './fixtures/app-ready';
import { expect, test } from './fixtures/browser-test';

/**
 * Visual regression tests for Chronicle public pages.
 *
 * Uses Playwright's built-in toHaveScreenshot() with a pixel-ratio
 * tolerance to catch unintended layout or style changes while
 * allowing minor anti-aliasing and rendering differences across
 * platforms.
 *
 * First run generates baseline screenshots under e2e/__screenshots__/.
 * Subsequent runs compare against them. Update baselines with:
 *   bunx playwright test visual-regression --update-snapshots
 */

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const SCREENSHOT_OPTIONS = {
  maxDiffPixelRatio: 0.01,
  animations: 'disabled' as const,
  fullPage: true,
};

/** Pages reachable without authentication. */
const PUBLIC_PAGES: {
  name: string;
  path: string;
  shell: 'app' | 'participant';
}[] = [
  { name: 'landing', path: '/', shell: 'app' },
  { name: 'dashboard', path: '/dashboard', shell: 'app' },
  { name: 'questionnaire', path: '/questionnaire', shell: 'participant' },
  { name: 'participant', path: '/participant', shell: 'participant' },
  { name: 'not-found', path: '/this-route-does-not-exist', shell: 'app' },
];

const VIEWPORTS = {
  desktop: { width: 1280, height: 720 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

const THEME_STORAGE_KEY = 'chronicle-theme';
type ScreenshotTheme = 'dark' | 'light';

test.beforeEach(async ({ page }) => {
  await page.route(`**${SESSION_PATH}`, async (route) => {
    await route.fulfill({
      // Authenticated: the app-shell pages below are behind the dashboard login gate,
      // and the theme-toggle affordance they screenshot only exists inside the shell.
      body: JSON.stringify(STABLE_AUTHENTICATED_SESSION),
      contentType: 'application/json',
      status: 200,
    });
  });
  await page.route('**/chronicle/api/web/study', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ body: '[]', contentType: 'application/json', status: 200 });
    } else {
      await route.continue();
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the page to fully settle before taking a screenshot. */
async function waitForPageReady(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  await expectAppRendered(page);
  // Give CSS transitions / animations time to complete
  await page.waitForTimeout(500);
}

/** Prime next-themes before navigation for participant routes that intentionally omit AppShell controls. */
async function setStoredThemeBeforeNavigation(
  page: import('@playwright/test').Page,
  theme: ScreenshotTheme,
) {
  await page.addInitScript(
    ({ storageKey, storedTheme }) => {
      window.localStorage.setItem(storageKey, storedTheme);
    },
    { storageKey: THEME_STORAGE_KEY, storedTheme: theme },
  );
}

async function expectStoredTheme(page: import('@playwright/test').Page, theme: ScreenshotTheme) {
  await expect
    .poll(async () => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), THEME_STORAGE_KEY))
    .toBe(theme);
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBe(theme === 'dark');
}

/** Switch to dark mode via the theme toggle menu. */
async function enableDarkMode(page: import('@playwright/test').Page) {
  const themeToggle = page.getByLabel('Toggle theme').filter({ visible: true }).first();
  await expect(themeToggle).toBeVisible({ timeout: 5_000 });
  await themeToggle.click();
  await page.getByRole('menuitem', { name: 'Dark' }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.classList.contains('dark')),
    )
    .toBe(true);
  // Let theme transition settle
  await page.waitForTimeout(300);
}

/** Switch to light mode via the theme toggle menu. */
async function enableLightMode(page: import('@playwright/test').Page) {
  const themeToggle = page.getByLabel('Toggle theme').filter({ visible: true }).first();
  await expect(themeToggle).toBeVisible({ timeout: 5_000 });
  await themeToggle.click();
  await page.getByRole('menuitem', { name: 'Light' }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => !document.documentElement.classList.contains('dark')),
    )
    .toBe(true);
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// Light-mode screenshots — default viewport (inherited from project config)
// ---------------------------------------------------------------------------

test.describe('visual regression — light mode (project viewport)', () => {
  for (const { name, path, shell } of PUBLIC_PAGES) {
    test(`${name} page matches baseline`, async ({ page }) => {
      if (shell === 'participant') await setStoredThemeBeforeNavigation(page, 'light');
      await page.goto(path);
      await waitForPageReady(page);
      if (shell === 'app') {
        await enableLightMode(page);
      } else {
        await expectStoredTheme(page, 'light');
      }

      await expect(page).toHaveScreenshot(`light-${name}.png`, SCREENSHOT_OPTIONS);
    });
  }
});

// ---------------------------------------------------------------------------
// Dark-mode screenshots — default viewport
// ---------------------------------------------------------------------------

test.describe('visual regression — dark mode (project viewport)', () => {
  for (const { name, path, shell } of PUBLIC_PAGES) {
    test(`${name} page in dark mode matches baseline`, async ({ page }) => {
      if (shell === 'participant') await setStoredThemeBeforeNavigation(page, 'dark');
      await page.goto(path);
      await waitForPageReady(page);
      if (shell === 'app') {
        await enableDarkMode(page);
      } else {
        await expectStoredTheme(page, 'dark');
      }

      await expect(page).toHaveScreenshot(`dark-${name}.png`, SCREENSHOT_OPTIONS);
    });
  }
});

// ---------------------------------------------------------------------------
// Responsive breakpoints — explicit viewport overrides
// ---------------------------------------------------------------------------

for (const [breakpoint, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`visual regression — ${breakpoint} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport });

    for (const { name, path, shell } of PUBLIC_PAGES) {
      test(`${name} page at ${breakpoint} matches baseline`, async ({ page }) => {
        if (shell === 'participant') await setStoredThemeBeforeNavigation(page, 'light');
        await page.goto(path);
        await waitForPageReady(page);
        if (shell === 'participant') await expectStoredTheme(page, 'light');

        await expect(page).toHaveScreenshot(
          `${breakpoint}-${name}.png`,
          SCREENSHOT_OPTIONS,
        );
      });
    }

    // Dark mode at each breakpoint for the landing page only (keeps the
    // matrix manageable while still covering the theme x layout interaction).
    test(`landing page in dark mode at ${breakpoint} matches baseline`, async ({ page }) => {
      await page.goto('/');
      await waitForPageReady(page);
      await enableDarkMode(page);

      await expect(page).toHaveScreenshot(
        `${breakpoint}-dark-landing.png`,
        SCREENSHOT_OPTIONS,
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Mobile navigation overlay
// ---------------------------------------------------------------------------

test.describe('visual regression — mobile nav overlay', () => {
  test.use({ viewport: VIEWPORTS.mobile });

  test('open mobile nav matches baseline', async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);

    const menuButton = page.getByLabel('Open navigation');
    await expect(menuButton).toBeVisible({ timeout: 5_000 });
    await menuButton.click();
    await page.waitForTimeout(400); // overlay animation

    await expect(page).toHaveScreenshot('mobile-nav-open.png', SCREENSHOT_OPTIONS);
  });

  test('open mobile nav in dark mode matches baseline', async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);
    await enableDarkMode(page);

    const menuButton = page.getByLabel('Open navigation');
    await expect(menuButton).toBeVisible({ timeout: 5_000 });
    await menuButton.click();
    await page.waitForTimeout(400);

    await expect(page).toHaveScreenshot('mobile-nav-open-dark.png', SCREENSHOT_OPTIONS);
  });
});
