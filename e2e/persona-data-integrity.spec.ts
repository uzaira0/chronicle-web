import { chronicleTest as test, expect } from './fixtures/chronicle-test';
import { fillRequiredParticipantPolicy, setStudyFeature } from './fixtures/study-form';

// Persona 5: Data Integrity Auditor — reproducibility, fidelity, persistence.
// What you see on screen must match what gets persisted; same input → same output.
// Driven through the DSL: API-seeded study for the persistence/reload checks
// (deterministic, no probabilistic skips), and a UI-form path for the input
// fidelity exercise.
test.describe.configure({ mode: 'serial' });

test.describe('persona: data integrity auditor', () => {
  test('reload mid-session does not lose the current view', async ({ scenario, providers }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.study(providers.data.study('Audit-Reload'), async (study) => {
          await study.asPersona('data-integrity-auditor', async (persona) => {
            await persona.openSeededStudy();
            const { page } = persona;
            const beforeUrl = page.url();
            const beforeHeading = (await page.getByRole('heading').first().textContent()) ?? '';
            expect(beforeHeading.length, 'Heading must render before reload').toBeGreaterThan(0);

            await page.reload();
            await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
            await persona.expectSuccessfulRoute();
            const afterUrl = page.url();
            const afterHeading = (await page.getByRole('heading').first().textContent()) ?? '';

            expect(afterUrl, 'URL must survive reload').toBe(beforeUrl);
            expect(afterHeading, 'Heading must survive reload').toBe(beforeHeading);
          });
        });
      });
    });
  });

  test('navigating away and back preserves the page state we left', async ({ scenario, providers }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.study(providers.data.study('Audit-Back'), async (study) => {
          await study.asPersona('data-integrity-auditor', async (persona) => {
            await persona.openSeededStudy();
            const { page } = persona;
            const beforeUrl = page.url();
            const beforeHeading = (await page.getByRole('heading').first().textContent()) ?? '';
            expect(beforeHeading.length, 'Heading must render').toBeGreaterThan(0);

            await page.goto('/');
            await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
            await page.goBack();
            await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
            await persona.expectSuccessfulRoute();

            const afterUrl = page.url();
            const afterHeading = (await page.getByRole('heading').first().textContent()) ?? '';
            expect(afterUrl).toBe(beforeUrl);
            expect(afterHeading).toBe(beforeHeading);
          });
        });
      });
    });
  });

  test('repeating identical navigation produces identical screen content', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('data-integrity-auditor', async (persona) => {
          await persona.openStudiesList();
          const { page } = persona;
          const firstHeading = (await page.getByRole('heading').first().textContent()) ?? '';
          const firstNavLinks = await page.locator('aside nav a').count();
          expect(firstHeading.length, 'Heading must render').toBeGreaterThan(0);
          expect(firstNavLinks, 'Aside nav must have at least one link').toBeGreaterThan(0);

          await page.goto('about:blank');
          await persona.openStudiesList();

          const secondHeading = (await page.getByRole('heading').first().textContent()) ?? '';
          const secondNavLinks = await page.locator('aside nav a').count();

          expect(secondHeading, 'Same page → same heading').toBe(firstHeading);
          expect(secondNavLinks, 'Same page → same primary nav link count').toBe(firstNavLinks);
        });
      });
    });
  });

  test('a DSL-seeded study persists across full page reload', async ({ scenario, providers }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.study(providers.data.study('Audit-Persist'), async (study) => {
          await study.asPersona('data-integrity-auditor', async (persona) => {
            await persona.openStudiesList();
            const { page } = persona;
            await expect(page.getByText(study.title).first()).toBeVisible({ timeout: 10_000 });

            await page.reload();
            await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
            await expect(page.getByText(study.title).first()).toBeVisible({ timeout: 15_000 });
          });
        });
      });
    });
  });

  test('study attributes shown on the detail page match what was entered at create time', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('data-integrity-auditor', async (persona) => {
          await persona.openStudiesList();
          const { page } = persona;
          const title = `Audit-Fidelity-${Date.now()}`;
          const description = 'Comprehensive audit verification';
          const contact = 'fidelity@chronicle.test';
          await page.getByRole('button', { name: /create new study/i }).click();
          const dialog = page.getByRole('dialog');
          await dialog.getByLabel(/study name/i).fill(title);
          await dialog.getByLabel(/description/i).fill(description);
          await dialog.getByLabel(/contact email/i).fill(contact);
          await fillRequiredParticipantPolicy(dialog, `integrity-${Date.now()}`);
          await setStudyFeature(dialog, 'Data Collection', true);
          await dialog.getByRole('button', { name: /^create study$/i }).click();
          await expect(dialog).toBeHidden({ timeout: 15_000 });

          await page.getByText(title).first().click();
          await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
          await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 });
          await expect(page.getByText(description)).toBeVisible({ timeout: 5_000 });
        });
      });
    });
  });

  test('navigating to the same DSL-seeded study twice produces the same destination', async ({ scenario, providers }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.study(providers.data.study('Audit-Twice'), async (study) => {
          await study.asPersona('data-integrity-auditor', async (persona) => {
            // Filter the study table so this test remains deterministic even
            // when a shared integration database contains many studies.
            await persona.openStudiesList();
            const { page } = persona;
            const search = page.getByRole('textbox', { name: /search studies/i });
            await search.fill(study.title);
            const seededRow = page.getByRole('row').filter({ hasText: study.title });
            await expect(seededRow, 'Seeded study row must render').toBeVisible({
              timeout: 10_000,
            });
            const firstNav = page.waitForURL(/\/studies\/[0-9a-f-]+/, { timeout: 10_000 });
            // StudyTableRow dropped its separate "Details →" column; the study title is the
            // row's only link now.
            await seededRow.getByRole('link', { name: study.title }).click();
            await firstNav;
            const firstUrl = page.url();

            // Second navigation: back to list, click the same seeded card again.
            await page.goBack();
            await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
            await page.getByRole('textbox', { name: /search studies/i }).fill(study.title);
            const seededRow2 = page.getByRole('row').filter({ hasText: study.title });
            await expect(seededRow2).toBeVisible({ timeout: 10_000 });
            const secondNav = page.waitForURL(/\/studies\/[0-9a-f-]+/, { timeout: 10_000 });
            await seededRow2.getByRole('link', { name: study.title }).click();
            await secondNav;
            const secondUrl = page.url();

            expect(secondUrl, 'Same study clicked twice → same destination').toBe(firstUrl);
          });
        });
      });
    });
  });
});
