import { chronicleTest as test, expect } from './fixtures/chronicle-test';
import { apiGet } from './dsl/di/api-client';
import { fillRequiredParticipantPolicy, setStudyFeature } from './fixtures/study-form';

interface StudySummary { id?: string; title: string }

// Persona 3 (UI arm): Adversary — security tester. Browser-stress tests only.
// Pure-API probes (unauth, malformed, oversized, traversal, races) live in the
// sibling `persona-adversary-api.spec.ts` so they don't pay the browser-spawn
// cost per test.
test.describe.configure({ mode: 'serial' });

test.describe('persona: adversary (UI)', () => {
  test('rapid-fire button clicks do not crash the page', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('adversary', async (persona) => {
          await persona.openStudiesList();
          const { page } = persona;
          const button = page.getByRole('button', { name: /create new study/i }).first();
          await expect(button).toBeVisible({ timeout: 10_000 });
          for (let i = 0; i < 25; i++) {
            await button.click({ trial: false }).catch(() => undefined);
            const dialog = page.getByRole('dialog');
            if (await dialog.isVisible({ timeout: 100 }).catch(() => false)) {
              await dialog.getByRole('button', { name: /cancel|close/i }).first().click().catch(() => undefined);
            }
          }
          await persona.expectSuccessfulRoute();
        });
      });
    });
  });

  test('submitting the same form twice in quick succession does not duplicate the study', async ({ scenario }, testInfo) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('adversary', async (persona) => {
          await persona.openStudiesList();
          const { page } = persona;
          // Playwright projects share the same backend and may start in the same
          // millisecond. Include the project/worker identity so this assertion
          // measures one dialog's submission fence rather than a parallel test.
          const title = `Adversary-Dup-${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
          await page.getByRole('button', { name: /create new study/i }).click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await dialog.getByLabel(/study name/i).fill(title);
          await dialog.getByLabel(/contact email/i).fill('adv@chronicle.test');
          await fillRequiredParticipantPolicy(dialog, `adversary-${Date.now()}`);
          await setStudyFeature(dialog, 'Data Collection', true);
          const submit = dialog.getByRole('button', { name: /^create study$/i });
          // Playwright's normal click waits for a disabled button to become
          // actionable again, so two concurrent locator.click() calls can turn
          // this race probe into a 30-second wait after navigation. Dispatch
          // both DOM clicks synchronously against the same rendered control.
          await submit.evaluate((button: HTMLButtonElement) => {
            button.click();
            button.click();
          });
          await expect(dialog).toBeHidden({ timeout: 15_000 });

          // Check via the API rather than counting DOM occurrences — the UI
          // can show the same title in multiple places under load (card title +
          // tooltip + cached list) which would falsely flake the test. The
          // backend list is authoritative.
          const studies = await apiGet<StudySummary[]>(persona.api, '/chronicle/v3/study');
          const matches = studies.filter((stu) => stu.title === title).length;
          expect(matches, `Double-click must create exactly one study (backend has ${matches})`).toBe(1);
        });
      });
    });
  });

  test('renders without error in a 320x568 viewport', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('adversary', async (persona) => {
          const errs = persona.capturePageErrors();
          await persona.page.setViewportSize({ width: 320, height: 568 });
          await persona.openPath('/');
          expect(errs.errors[0], `Tiny viewport caused JS error: ${errs.errors[0]?.message ?? ''}`).toBeUndefined();
        });
      });
    });
  });
});
