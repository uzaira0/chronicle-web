import { expect, test } from './fixtures/browser-test';
import {
  SESSION_PATH,
  STABLE_AUTHENTICATED_SESSION,
  STABLE_UNAUTHENTICATED_SESSION,
} from './dsl/constants';

// These assertions track the current eqds-restyled shell. The shell renders an
// "Operations overview" dashboard at / and /dashboard, a "Studies" catalog that
// gates behind SSO, and a 404 "Page not found" fallback for unmapped routes. Deep links
// (including /modern- and /chronicle-prefixed variants) all resolve to the
// same shell routes.

test.describe('modern shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`**${SESSION_PATH}`, async (route) => {
      await route.fulfill({
        body: JSON.stringify(STABLE_AUTHENTICATED_SESSION),
        contentType: 'application/json',
        status: 200,
      });
    });
  });

  test('loads the overview for an authenticated session', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();
  });

  test('replaces the shell with the sign-in page when unauthenticated', async ({ page }) => {
    await page.route(`**${SESSION_PATH}`, async (route) => {
      await route.fulfill({
        body: JSON.stringify(STABLE_UNAUTHENTICATED_SESSION),
        contentType: 'application/json',
        status: 200,
      });
    });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Sign in to the dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeHidden();
  });

  test('switches to dark mode from the theme menu', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Toggle theme').filter({ visible: true }).first().click();
    await page.getByRole('menuitem', { name: 'Dark' }).click();

    await expect.poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  });

  test('keeps the selected theme after a reload', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Toggle theme').filter({ visible: true }).first().click();
    await page.getByRole('menuitem', { name: 'Dark' }).click();
    await page.reload();

    await expect.poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  });

  test('navigates to studies from the mobile menu', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto('/');

    await page.getByLabel('Open navigation').click();
    await page.getByRole('link', { name: 'Studies', exact: true }).click();

    await expect(page).toHaveURL(/\/studies$/);
    await expect(page.locator('main').getByRole('heading', { name: 'Studies', exact: true })).toBeVisible();
  });

  test('loads the studies route directly and keeps it after reload', async ({ page }) => {
    await page.goto('/studies');

    await expect(page.locator('main').getByRole('heading', { name: 'Studies', exact: true })).toBeVisible();
    await page.reload();

    await expect(page).toHaveURL(/\/studies$/);
    await expect(page.locator('main').getByRole('heading', { name: 'Studies', exact: true })).toBeVisible();
  });

  test('loads the dashboard route directly in the modern shell', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();
  });

  test('loads a /modern-prefixed deep link directly', async ({ page }) => {
    await page.goto('/modern/dashboard');

    await expect(page).toHaveURL(/\/modern\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();
  });

  test('loads a /chronicle/modern-prefixed deep link directly', async ({ page }) => {
    await page.goto('/chronicle/modern/studies');

    await expect(page).toHaveURL(/\/chronicle\/modern\/studies$/);
    await expect(page.locator('main').getByRole('heading', { name: 'Studies', exact: true })).toBeVisible();
  });

  test('loads a /chronicle-prefixed studies deep link directly', async ({ page }) => {
    await page.goto('/chronicle/studies');

    await expect(page).toHaveURL(/\/chronicle\/studies$/);
    await expect(page.locator('main').getByRole('heading', { name: 'Studies', exact: true })).toBeVisible();
  });

  test('loads the participant dashboard deep link in the modern shell', async ({ page }) => {
    await page.goto('/participant');

    await expect(page).toHaveURL(/\/participant$/);
    await expect(page.getByRole('heading', { name: 'A new link is required' })).toBeVisible();
    await expect(page.getByText('This participant link is missing a valid one-time access code.')).toBeVisible();
  });

  test('loads the study questionnaire route directly in the modern shell', async ({ page }) => {
    await page.goto('/studies/test-study/questionnaires');

    await expect(page).toHaveURL(/\/studies\/test-study\/questionnaires$/);
    await expect(page.getByRole('heading', { name: /(?:Questionnaires for study test-study|Study not found or unavailable)/ })).toBeVisible();
  });

  test('loads the direct study detail route in the modern shell', async ({ page }) => {
    await page.goto('/studies/test-study');

    await expect(page).toHaveURL(/\/studies\/test-study$/);
    await expect(page.getByRole('heading', { name: /(?:Study test-study|Loading test-study|Unable to open study details|Study not found or unavailable)/ })).toBeVisible();
  });

  test('loads the /chronicle direct study detail route in the modern shell', async ({ page }) => {
    await page.goto('/chronicle/studies/test-study');

    await expect(page).toHaveURL(/\/chronicle\/studies\/test-study$/);
    await expect(page.getByRole('heading', { name: /(?:Study test-study|Loading test-study|Unable to open study details|Study not found or unavailable)/ })).toBeVisible();
  });

  test('loads the direct questionnaire route in the modern shell', async ({ page }) => {
    await page.goto('/questionnaire');

    await expect(page).toHaveURL(/\/questionnaire$/);
    await expect(page.getByRole('heading', { name: 'A new link is required' })).toBeVisible();
    await expect(page.getByText('This participant link is missing a valid one-time access code.')).toBeVisible();
  });

  test('loads the /chronicle/questionnaire route in the modern shell', async ({ page }) => {
    await page.goto('/chronicle/questionnaire');

    await expect(page).toHaveURL(/\/chronicle\/questionnaire$/);
    await expect(page.getByRole('heading', { name: 'A new link is required' })).toBeVisible();
  });

  test('loads the study TUD route directly in the modern shell', async ({ page }) => {
    await page.goto('/studies/test-study/time-use-diary');

    await expect(page).toHaveURL(/\/studies\/test-study\/time-use-diary$/);
    await expect(page.getByRole('heading', { name: /(?:Time Use Diary exports for study test-study|Study not found or unavailable)/ })).toBeVisible();
  });

  test('shows the not-found route for unknown paths', async ({ page }) => {
    await page.goto('/missing-route');

    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.getByText('The requested page could not be found.')).toBeVisible();
  });
});
