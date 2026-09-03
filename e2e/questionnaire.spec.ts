import {
  SESSION_PATH,
  STABLE_UNAUTHENTICATED_SESSION,
} from './dsl/constants';
import {
  chronicleTest as test,
  expect,
} from './fixtures/chronicle-test';

test.describe('questionnaire management', () => {
  test('questionnaire route renders the safe participant-access state', async ({
    page,
  }) => {
    await page.route(`**${SESSION_PATH}`, async (route) => {
      await route.fulfill({
        body: JSON.stringify(STABLE_UNAUTHENTICATED_SESSION),
        contentType: 'application/json',
        status: 200,
      });
    });
    await page.goto('/questionnaire');
    await expect(
      page.getByRole('heading', { name: 'A new link is required' }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(
        'This participant link is missing a valid one-time access code.',
      ),
    ).toBeVisible();
  });

  test('questionnaire tab is accessible from a seeded study', async ({
    providers,
    scenario,
  }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        const spec = {
          ...providers.data.study('Questionnaire-Tab'),
          modules: { CHRONICLE_SURVEYS: {} },
        };
        await auth.study(spec, async (study) => {
          await study.asPersona('expert-researcher', async (persona) => {
            await persona.openSeededStudy();
            await persona.page
              .getByRole('link', { name: 'Questionnaires', exact: true })
              .click();
            await expect(
              persona.page.getByRole('heading', {
                name: `Questionnaires for ${study.title}`,
              }),
            ).toBeVisible();
          });
        });
      });
    });
  });

  test('questionnaire section shows its create action', async ({
    providers,
    scenario,
  }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        const spec = {
          ...providers.data.study('Questionnaire-Create'),
          modules: { CHRONICLE_SURVEYS: {} },
        };
        await auth.study(spec, async (study) => {
          await study.asPersona('expert-researcher', async (persona) => {
            await persona.openSeededStudy();
            await persona.page
              .getByRole('link', { name: 'Questionnaires', exact: true })
              .click();
            await expect(
              persona.page.getByRole('button', {
                name: 'Create Questionnaire',
                exact: true,
              }),
            ).toBeVisible();
          });
        });
      });
    });
  });
});
