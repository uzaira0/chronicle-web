import type { Page } from '@playwright/test';

export const SEEDED_STUDY = {
  contact: 'e2e@example.com',
  description: 'Seeded for the modern shell routing specs.',
  id: 'test-study',
  modules: { CHRONICLE_DATA_COLLECTION: {}, CHRONICLE_SURVEYS: {} },
  notificationsEnabled: false,
  settings: {},
  title: 'Modern Shell Route Study',
  version: '1',
} as const;

export async function seedStudyRoutes(page: Page) {
  await page.route('**/chronicle/api/web/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const prefix = `/chronicle/api/web/study/${SEEDED_STUDY.id}`;
    const responses: Record<string, unknown> = {
      '/chronicle/api/web/study': [],
      [prefix]: SEEDED_STUDY,
      [`${prefix}/lifecycle`]: 'ACTIVE',
      [`${prefix}/participants`]: [],
      [`${prefix}/settings/type/DataCollection`]: { modules: {} },
      [`${prefix}/settings`]: {},
      [`/chronicle/api/web/survey/${SEEDED_STUDY.id}/questionnaire`]: [],
    };
    await route.fulfill({ json: responses[path] ?? {}, status: path in responses ? 200 : 404 });
  });
}
