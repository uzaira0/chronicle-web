import {
  chronicleTest as test,
  expect,
} from './fixtures/chronicle-test';
import { headerCreateStudyButton } from './fixtures/study-form';

test.describe('study CRUD operations', () => {
  test('displays the studies list page', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('expert-researcher', async (persona) => {
          await persona.openStudiesList();
          await expect(
            persona.page.getByRole('heading', {
              name: 'Studies',
              exact: true,
            }),
          ).toBeVisible();
        });
      });
    });
  });

  test('shows the create-study action', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('expert-researcher', async (persona) => {
          await persona.openStudiesList();
          await expect(
            headerCreateStudyButton(persona.page),
          ).toBeVisible();
        });
      });
    });
  });

  test('create study dialog opens when button is clicked', async ({
    scenario,
  }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('expert-researcher', async (persona) => {
          await persona.openStudiesList();
          await headerCreateStudyButton(persona.page)
            .click();
          await expect(persona.page.getByRole('dialog')).toBeVisible();
        });
      });
    });
  });

  test('study form refuses an empty create and names the missing fields', async ({
    scenario,
  }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('expert-researcher', async (persona) => {
          await persona.openStudiesList();
          await headerCreateStudyButton(persona.page).click();
          const dialog = persona.page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await dialog.getByRole('button', { name: /^create study$/i }).click();
          await expect(dialog.getByRole('alert')).toContainText('Fix the highlighted fields before saving.');
          await expect(dialog).toBeVisible();
        });
      });
    });
  });

  test('navigates to a seeded study from the study table', async ({
    providers,
    scenario,
  }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.study(
          providers.data.study('Crud-Navigate'),
          async (study) => {
            await study.asPersona('expert-researcher', async (persona) => {
              await persona.openStudiesList();
              await persona.page
                .getByRole('searchbox', { name: /search studies/i })
                .fill(study.title);
              const row = persona.page
                .getByRole('row')
                .filter({ hasText: study.title });
              await expect(row).toBeVisible();
              // The study title is the row's only link; StudyTableRow has no "Details →" column.
              await row.getByRole('link', { name: study.title }).click();
              await expect(persona.page).toHaveURL(
                new RegExp(`/studies/${study.id}$`),
              );
            });
          },
        );
      });
    });
  });

  test('seeded study detail renders its title and navigation', async ({
    providers,
    scenario,
  }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.study(
          providers.data.study('Crud-Detail'),
          async (study) => {
            await study.asPersona('expert-researcher', async (persona) => {
              await persona.openSeededStudy();
              await expect(
                persona.page.getByRole('heading', {
                  name: study.title,
                }),
              ).toBeVisible();
              await expect(
                persona.page.getByRole('link', {
                  name: 'Participants',
                  exact: true,
                }),
              ).toBeVisible();
            });
          },
        );
      });
    });
  });
});
