import { chronicleTest as test, expect } from './fixtures/chronicle-test';
import { TESTING_LOGIN_PATH } from './dsl/constants';
import { expectAppRendered } from './fixtures/app-ready';
import { fillRequiredParticipantPolicy, setStudyFeature } from './fixtures/study-form';

// Persona 2: Novice User — predictable mistakes must produce helpful messages, not crashes.
// Driven through the DSL: API-seeded study for the destructive-cancel exercise; UI-only
// for empty-state, validation, and back-button flows.
test.describe.configure({ mode: 'serial' });

test.describe('persona: novice user', () => {
  test('shows the studies page without rendering an ErrorBoundary fallback', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_user1', async (auth) => {
        await auth.asPersona('novice-user', async (persona) => {
          const errs = persona.capturePageErrors();
          await persona.openStudiesList();
          const fallback = persona.page.getByText(/something went wrong|stack trace|application crashed/i).first();
          expect(await fallback.isVisible({ timeout: 2_000 }).catch(() => false)).toBe(false);
          await expect(persona.page.getByRole('button', { name: /create new study/i })).toBeVisible({ timeout: 10_000 });
          expect(errs.errors[0], `Studies page crashed with: ${errs.errors[0]?.message ?? ''}`).toBeUndefined();
        });
      });
    });
  });

  test('navigating to a non-existent study shows a not-found message', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_user1', async (auth) => {
        await auth.asPersona('novice-user', async (persona) => {
          await persona.openPath('/studies/00000000-0000-0000-0000-000000000999');
          const notFound = persona.page.getByText(/not found|does not exist|missing|unavailable/i).first();
          await expect(notFound).toBeVisible({ timeout: 10_000 });
        });
      });
    });
  });

  test('create-study submit is disabled until required fields are valid', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_user1', async (auth) => {
        await auth.asPersona('novice-user', async (persona) => {
          await persona.openStudiesList();
          const { page } = persona;
          await page.getByRole('button', { name: /create new study/i }).click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          const submit = dialog.getByRole('button', { name: /^create study$/i });

          await expect(submit).toBeDisabled();

          await dialog.getByLabel(/study name/i).fill('Novice-Validation');
          await dialog.getByLabel(/contact email/i).fill('novice@chronicle.test');
          await expect(submit).toBeDisabled();

          await fillRequiredParticipantPolicy(dialog, 'novice-validation');
          await setStudyFeature(dialog, 'Data Collection', true);
          await expect(submit).toBeEnabled({ timeout: 5_000 });

          await dialog.getByRole('button', { name: /cancel/i }).click();
          await expect(dialog).toBeHidden({ timeout: 5_000 });
        });
      });
    });
  });

  test('clicking cancel on a destructive delete dialog does not actually delete the study', async ({ scenario, providers }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.study(providers.data.study('Novice-Cancel'), async (study) => {
          await study.asPersona('novice-user', async (persona) => {
            await persona.openStudiesList();
            const { page } = persona;
            // Drill in via the seeded study (no UI form needed).
            await persona.openSeededStudy();

            const studyActions = page.getByRole('button', {
              name: /study actions/i,
            });
            await expect(studyActions).toBeVisible({ timeout: 10_000 });
            await studyActions.click();
            await page.getByRole('menuitem', { name: /delete study/i }).click();
            const confirmDialog = page.getByRole('dialog').filter({ hasText: /delete/i });
            await expect(confirmDialog).toBeVisible({ timeout: 5_000 });
            await confirmDialog.getByRole('button', { name: /cancel/i }).click();
            await expect(confirmDialog).toBeHidden({ timeout: 5_000 });

            await persona.openStudiesList();
            await page.getByRole('textbox', { name: /search studies/i }).fill(study.title);
            await expect(page.getByRole('row').filter({ hasText: study.title })).toBeVisible({
              timeout: 5_000,
            });
          });
        });
      });
    });
  });

  test('attempting testing-login with an unknown userId returns a clear error', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_user1', async (auth) => {
        await auth.asPersona('novice-user', async (persona) => {
          const response = await persona.page.request.post(
            `${persona.api.baseUrl}${TESTING_LOGIN_PATH}`,
            {
              data: { userId: `definitely-not-a-real-user-${Date.now()}` },
              headers: { 'Content-Type': 'application/json' },
              failOnStatusCode: false,
            },
          );
          expect(response.status(), 'Unknown userId should be rejected with 4xx, not 5xx').toBeLessThan(500);
          expect(response.status()).toBeGreaterThanOrEqual(400);
        });
      });
    });
  });

  test('back button after navigating around does not crash the app', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_user1', async (auth) => {
        await auth.asPersona('novice-user', async (persona) => {
          await persona.openStudiesList();
          const { page } = persona;
          const distinct = (await persona.navigableHrefs()).slice(0, 3);
          expect(
            distinct.length,
            'Back-navigation exercise requires at least two distinct application destinations',
          ).toBeGreaterThanOrEqual(2);
          for (const href of distinct) {
            await persona.openPath(href);
          }
          await page.goBack({ waitUntil: 'domcontentloaded' });
          await page.goBack({ waitUntil: 'domcontentloaded' });
          await expectAppRendered(page);
        });
      });
    });
  });
});
