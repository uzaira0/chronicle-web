import type { Page } from '@playwright/test';
import {
  SESSION_PATH,
  STABLE_UNAUTHENTICATED_SESSION,
} from './dsl/constants';
import {
  chronicleTest as test,
  expect,
} from './fixtures/chronicle-test';

async function useUnauthenticatedSession(page: Page): Promise<void> {
  await page.route(`**${SESSION_PATH}`, async (route) => {
    await route.fulfill({
      body: JSON.stringify(STABLE_UNAUTHENTICATED_SESSION),
      contentType: 'application/json',
      status: 200,
    });
  });
}

test.describe('authentication flow', () => {
  test('keeps the dashboard out of reach without a session', async ({ page }) => {
    await useUnauthenticatedSession(page);
    await page.goto('/');
    // The dashboard must never render for an unauthenticated visitor, not even
    // behind a banner.
    await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeHidden();
  });

  test('displays the dashboard login form when not authenticated', async ({ page }) => {
    await useUnauthenticatedSession(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sign in to the dashboard' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel('Dashboard password')).toBeVisible();
  });

  test('navigates to studies page after authentication', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_user1', async (auth) => {
        await auth.asPersona('novice-user', async (persona) => {
          await persona.openStudiesList();
          await expect(persona.page).toHaveURL(/\/studies$/);
          await expect(
            persona.page.getByRole('heading', {
              name: 'Studies',
              exact: true,
            }),
          ).toBeVisible();
          await expect(persona.page.getByText('Signed in')).toBeVisible();
        });
      });
    });
  });

  test('protected routes show the login page when unauthenticated', async ({ page }) => {
    await useUnauthenticatedSession(page);
    await page.goto('/studies/non-existent-study');
    await expect(page.getByRole('heading', { name: 'Sign in to the dashboard' })).toBeVisible();
  });

  test('ignores an expired legacy local-storage token', async ({ page }) => {
    await useUnauthenticatedSession(page);
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('chronicle_jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.invalid');
    });
    await page.reload();
    await expect(page.getByText('Signed in')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Sign in to the dashboard' })).toBeVisible();
  });
});
