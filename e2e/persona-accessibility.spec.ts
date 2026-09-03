import { chronicleTest as test, expect } from './fixtures/chronicle-test';

// Persona 4: Accessibility — keyboard, screen-reader, low-vision.
// WCAG 2.1 AA via axe-core, plus DOM semantics inspection. Driven through the DSL
// so axe scans run against the same seeded data the API tests created.
test.describe.configure({ mode: 'serial' });

test.describe('persona: accessibility', () => {
  test('axe-core: zero critical or serious violations on the home page', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('accessibility', async (persona) => {
          await persona.openStudiesList();
          await persona.axeScan();
        });
      });
    });
  });

  test('every visible <button> has an accessible name', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('accessibility', async (persona) => {
          await persona.openStudiesList();
          const buttons = persona.page.locator('button:visible');
          const count = await buttons.count();
          expect(count, 'Studies page must render at least one button').toBeGreaterThan(0);
          for (let i = 0; i < count; i++) {
            const button = buttons.nth(i);
            const accessibleName =
              (await button.getAttribute('aria-label')) ??
              (await button.getAttribute('aria-labelledby')) ??
              (await button.textContent());
            expect(
              accessibleName?.trim().length ?? 0,
              `Button #${i} has no accessible name (HTML: ${(await button.innerHTML()).slice(0, 80)})`,
            ).toBeGreaterThan(0);
          }
        });
      });
    });
  });

  test('every visible <input> has an associated label or aria-label', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('accessibility', async (persona) => {
          await persona.openStudiesList();
          const { page } = persona;
          const createButton = page.getByRole('button', { name: /create|new|add/i }).first();
          await expect(
            createButton,
            'Studies page must expose the create-study dialog before input-label checks run',
          ).toBeVisible({ timeout: 5_000 });
          await createButton.click();
          await page.waitForTimeout(500);
          const inputs = page.locator('input:not([type=hidden]):visible, textarea:visible, select:visible');
          const count = await inputs.count();
          expect(
            count,
            'Create-study dialog must render at least one visible form control',
          ).toBeGreaterThan(0);
          for (let i = 0; i < count; i++) {
            const input = inputs.nth(i);
            const ariaLabel = await input.getAttribute('aria-label');
            const ariaLabelledBy = await input.getAttribute('aria-labelledby');
            const id = await input.getAttribute('id');
            let hasLabelFor = false;
            if (id) {
              hasLabelFor = (await page.locator(`label[for="${id}"]`).count()) > 0;
            }
            const wrappedInLabel = (await input.locator('xpath=ancestor::label').count()) > 0;
            expect(
              Boolean(ariaLabel || ariaLabelledBy || hasLabelFor || wrappedInLabel),
              `Input #${i} has no associated label (id="${id}", aria-label="${ariaLabel}")`,
            ).toBe(true);
          }
        });
      });
    });
  });

  test('keyboard-only: Tab cycles through visible interactive elements', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('accessibility', async (persona) => {
          await persona.openStudiesList();
          const tabbed = await persona.tabCycle(6);
          const interactive = tabbed.filter((t) => t && t !== 'BODY');
          expect(interactive.length, 'Tab should advance focus to interactive elements').toBeGreaterThan(1);
        });
      });
    });
  });

  test('keyboard-only: focused elements have a visible focus indicator', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('accessibility', async (persona) => {
          await persona.openStudiesList();
          await persona.page.keyboard.press('Tab');
          const outlineSetting = await persona.page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el) return { outline: '', boxShadow: '' };
            const style = getComputedStyle(el);
            return { outline: style.outlineWidth + ' ' + style.outlineStyle, boxShadow: style.boxShadow };
          });
          const hasFocusRing =
            outlineSetting.outline.trim() !== '0px none' &&
            outlineSetting.outline.trim() !== '' &&
            !outlineSetting.outline.startsWith('0px');
          const hasShadowRing =
            outlineSetting.boxShadow !== 'none' && outlineSetting.boxShadow.trim() !== '';
          expect(
            hasFocusRing || hasShadowRing,
            `Focused element has no visible focus indicator (outline="${outlineSetting.outline}", boxShadow="${outlineSetting.boxShadow}")`,
          ).toBe(true);
        });
      });
    });
  });

  test('dialogs have role=dialog and aria-modal=true', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('accessibility', async (persona) => {
          await persona.openStudiesList();
          await persona.page.getByRole('button', { name: /create new study/i }).click();
          const dialog = persona.page.getByRole('dialog');
          await expect(dialog).toBeVisible({ timeout: 5_000 });
          const ariaModal = await dialog.getAttribute('aria-modal');
          expect(ariaModal, 'Dialog must have aria-modal="true" for screen readers').toBe('true');
        });
      });
    });
  });

  test('icon-only buttons have aria-label', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('accessibility', async (persona) => {
          await persona.openStudiesList();
          const iconButtons = persona.page.locator('button:visible').filter({
            has: persona.page.locator('svg, img'),
          });
          const count = await iconButtons.count();
          expect(
            count,
            'Studies shell must render at least one visible icon button',
          ).toBeGreaterThan(0);
          for (let i = 0; i < count; i++) {
            const btn = iconButtons.nth(i);
            const text = (await btn.textContent())?.trim() ?? '';
            if (text.length > 0) continue;
            const ariaLabel = await btn.getAttribute('aria-label');
            const title = await btn.getAttribute('title');
            expect(
              Boolean(ariaLabel?.trim() || title?.trim()),
              `Icon-only button #${i} has neither aria-label nor title`,
            ).toBe(true);
          }
        });
      });
    });
  });

  test('headings follow a sane hierarchy without skipping levels', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('accessibility', async (persona) => {
          await persona.openStudiesList();
          const headings = await persona.page.locator('h1, h2, h3, h4, h5, h6').all();
          expect(
            headings.length,
            'Studies page must render at least one heading before hierarchy checks run',
          ).toBeGreaterThan(0);
          const levels = await Promise.all(
            headings.map(async (h) => Number((await h.evaluate((el) => el.tagName)).slice(1))),
          );
          for (let i = 1; i < levels.length; i++) {
            const prev = levels[i - 1] ?? 0;
            const curr = levels[i] ?? 0;
            const jump = curr - prev;
            expect(jump, `Heading level skip from h${prev} to h${curr} at index ${i}`).toBeLessThanOrEqual(1);
          }
        });
      });
    });
  });

  test('200% zoom (small viewport): no horizontal scroll on body', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('accessibility', async (persona) => {
          await persona.page.setViewportSize({ width: 640, height: 480 });
          await persona.openPath('/');
          const overflow = await persona.page.evaluate(() => {
            const body = document.body;
            return body.scrollWidth - body.clientWidth;
          });
          expect(overflow, `Body scrolls horizontally at 200% zoom (overflow=${overflow}px)`).toBeLessThan(6);
        });
      });
    });
  });
});
