import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const UIAssertions = {
  async assertStudyVisible(page: Page, studyTitle: string): Promise<void> {
    await expect(page.getByText(studyTitle)).toBeVisible();
  },

  async assertParticipantVisible(page: Page, participantId: string): Promise<void> {
    await expect(page.getByText(participantId)).toBeVisible();
  },

  async assertPageTitle(page: Page, expectedTitle: string): Promise<void> {
    await expect(page).toHaveTitle(new RegExp(expectedTitle, 'i'));
  },
};
