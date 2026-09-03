import {
  chronicleTest as test,
  expect,
} from './fixtures/chronicle-test';

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
            persona.page.getByRole('button', {
              name: /create new study/i,
            }),
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
          await persona.page
            .getByRole('button', { name: /create new study/i })
            .click();
          await expect(persona.page.getByRole('dialog')).toBeVisible();
        });
      });
    });
  });

  test('study form keeps create disabled while required fields are empty', async ({
    scenario,
  }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('expert-researcher', async (persona) => {
          await persona.openStudiesList();
          await persona.page
            .getByRole('button', { name: /create new study/i })
            .click();
          const dialog = persona.page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await expect(
            dialog.getByRole('button', { name: /^create study$/i }),
          ).toBeDisabled();
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
                .getByRole('textbox', { name: /search studies/i })
                .fill(study.title);
              const row = persona.page
                .getByRole('row')
                .filter({ hasText: study.title });
              await expect(row).toBeVisible();
              // The study title is the row's link. StudyTableRow used to carry a separate
              // "Details →" column doing the same navigation and it was removed, so a
              // /details/i lookup here matches nothing and the click times out.
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
