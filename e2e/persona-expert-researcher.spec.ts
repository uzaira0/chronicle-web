import { chronicleTest as test, expect } from './fixtures/chronicle-test';
import { fillRequiredParticipantPolicy, setStudyFeature } from './fixtures/study-form';

// Persona 1: Expert Power User — uses every feature, configures every setting.
// Now driven through the chronicleScenario DSL: API-seeded studies for tab-walks
// and detail-page assertions; UI form interaction kept for the create-flow exercises.
test.describe.configure({ mode: 'serial' });

test.describe('persona: expert researcher', () => {
  test('lands on the studies page after authentication', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('expert-researcher', async (persona) => {
          await persona.openStudiesList();
          await expect(persona.page.getByRole('button', { name: /create new study/i })).toBeVisible({ timeout: 10_000 });
          await expect(persona.page.getByRole('heading').first()).toBeVisible();
        });
      });
    });
  });

  test('opens the create-study dialog and exercises every form field, then cancels', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('expert-researcher', async (persona) => {
          await persona.openStudiesList();
          const { page } = persona;
          await page.getByRole('button', { name: /create new study/i }).click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible({ timeout: 5_000 });

          await dialog.getByLabel(/study name/i).fill(`Expert-Probe-${Date.now()}`);
          await dialog.getByLabel(/description/i).fill('Comprehensive end-to-end exercise.');
          await dialog.getByLabel(/study group/i).fill('Sleep Research');
          await dialog.getByLabel('Version', { exact: true }).fill('v1.0');
          await dialog.getByLabel(/contact email/i).fill('expert@chronicle.test');
          await fillRequiredParticipantPolicy(dialog, `expert-fields-${Date.now()}`);

          const checkboxes = dialog.locator('input[type="checkbox"]');
          const cbCount = await checkboxes.count();
          expect(cbCount, 'Expected at least one module toggle in create dialog').toBeGreaterThan(0);
          for (let i = 0; i < cbCount; i++) {
            await checkboxes.nth(i).click({ force: true });
          }

          await dialog.getByRole('button', { name: /cancel/i }).click();
          await expect(dialog).toBeHidden({ timeout: 5_000 });
        });
      });
    });
  });

  test('creates a study end-to-end through the UI and it appears in the list', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('expert-researcher', async (persona) => {
          await persona.openStudiesList();
          const { page } = persona;
          const title = `Expert-Created-${Date.now()}`;
          await page.getByRole('button', { name: /create new study/i }).click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await dialog.getByLabel(/study name/i).fill(title);
          await dialog.getByLabel(/contact email/i).fill('expert@chronicle.test');
          await fillRequiredParticipantPolicy(dialog, `expert-create-${Date.now()}`);
          await setStudyFeature(dialog, 'Data Collection', true);
          await dialog.getByRole('button', { name: /^create study$/i }).click();
          await expect(dialog).toBeHidden({ timeout: 15_000 });
          await page.goto('/studies');
          await page.getByRole('textbox', { name: /search studies/i }).fill(title);
          await expect(page.getByRole('row').filter({ hasText: title })).toBeVisible({
            timeout: 10_000,
          });
        });
      });
    });
  });

  test('exercises every visible top-level navigation target', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('expert-researcher', async (persona) => {
          await persona.openStudiesList();
          const distinct = await persona.navigableHrefs();
          expect(distinct.length, 'Expected at least one navigable destination').toBeGreaterThan(0);
          for (const href of distinct) {
            await persona.openPath(href);
            await persona.expectSuccessfulRoute();
          }
        });
      });
    });
  });

  test('drills into a DSL-seeded study and reaches every visible tab', async ({ scenario, providers }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.study(providers.data.study('Tab-Walk'), async (study) => {
          await study.asPersona('expert-researcher', async (persona) => {
            await persona.openSeededStudy();
            const { page } = persona;
            await expect(page.locator('main nav a').first()).toBeVisible({ timeout: 10_000 });
            const tabHrefs = await page
              .locator('main nav a')
              .evaluateAll((els) =>
                (els as HTMLAnchorElement[])
                  .map((a) => a.getAttribute('href'))
                  .filter((h): h is string => Boolean(h && h.includes('/studies/'))),
              );
            expect(tabHrefs.length, 'Study layout should expose at least one tab/sub-route').toBeGreaterThan(0);
            for (const href of tabHrefs) {
              await persona.openPath(href);
              await persona.expectSuccessfulRoute();
            }
          });
        });
      });
    });
  });
});
