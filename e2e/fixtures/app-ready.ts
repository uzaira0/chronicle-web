import { expect, type Page } from '@playwright/test';

export async function expectAppRendered(page: Page): Promise<void> {
  const mainContent = page.locator('#app main, #app [role="main"]').filter({ visible: true }).first();
  await expect(mainContent, 'The mounted application must render its main content landmark').toBeVisible({
    timeout: 10_000,
  });
  await expect(mainContent, 'The mounted application main content must not be blank').toContainText(/\S/);
}
