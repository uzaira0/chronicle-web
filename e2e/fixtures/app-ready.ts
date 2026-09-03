import { expect, type Page } from '@playwright/test';

export async function expectAppRendered(page: Page): Promise<void> {
  await expect(
    page.locator('#app > :not(script):not(style)').first(),
    'The production application must mount into #app before browser assertions run',
  ).toBeVisible({ timeout: 10_000 });
  const mainContent = page.locator('main, [role="main"]').first();
  await expect(
    mainContent,
    'The mounted application must render its main content landmark',
  ).toBeVisible();
  await expect(
    mainContent,
    'The mounted application main content must not be blank',
  ).toContainText(/\S/);
}
