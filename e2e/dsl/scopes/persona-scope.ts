import { expect, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { ApiClient } from '../di/api-client.js';
import type { ScenarioContext } from '../scenario-context.js';
import { DIRECT_BACKEND_URL } from '../constants.js';
import { expectAppRendered } from '../../fixtures/app-ready.js';

export type PersonaName =
  | 'expert-researcher'
  | 'novice-user'
  | 'adversary'
  | 'accessibility'
  | 'data-integrity-auditor';

export interface PersonaSeed {
  studyId?: string;
  participantId?: string;
}

export type AxeImpact = 'critical' | 'serious' | 'moderate' | 'minor';

export interface AxeOpts {
  tags?: string[];
  impacts?: AxeImpact[];
}

export class PersonaScope {
  readonly ctx: ScenarioContext;
  readonly name: PersonaName;
  readonly page: Page;
  readonly context: BrowserContext;
  readonly api: ApiClient;
  readonly seed: PersonaSeed;
  readonly directBackendUrl: string;

  constructor(
    ctx: ScenarioContext,
    name: PersonaName,
    page: Page,
    context: BrowserContext,
    api: ApiClient,
    seed: PersonaSeed = {},
    directBackendUrl: string = DIRECT_BACKEND_URL,
  ) {
    this.ctx = ctx;
    this.name = name;
    this.page = page;
    this.context = context;
    this.api = api;
    this.seed = seed;
    this.directBackendUrl = directBackendUrl;
  }

  async openStudiesList(): Promise<void> {
    await this.page.goto('/studies');
    // Bounded networkidle: SPA hydration usually settles in <2s; cap at 5s so
    // a never-idle background poll can't burn the full 30s default timeout.
    // Swallowing the timeout here is intentional — assertions immediately after
    // do their own retries, and `domcontentloaded` alone fires before React hydrates.
    await this.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    await this.expectSuccessfulRoute();
  }

  async openSeededStudy(): Promise<void> {
    if (!this.seed.studyId) {
      throw new Error(`PersonaScope[${this.name}]: no seeded study available`);
    }
    await this.page.goto(`/studies/${this.seed.studyId}`);
    // Bounded networkidle: SPA hydration usually settles in <2s; cap at 5s so
    // a never-idle background poll can't burn the full 30s default timeout.
    // Swallowing the timeout here is intentional — assertions immediately after
    // do their own retries, and `domcontentloaded` alone fires before React hydrates.
    await this.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    await this.expectSuccessfulRoute();
  }

  async openPath(path: string): Promise<void> {
    await this.page.goto(path);
    // Bounded networkidle: SPA hydration usually settles in <2s; cap at 5s so
    // a never-idle background poll can't burn the full 30s default timeout.
    // Swallowing the timeout here is intentional — assertions immediately after
    // do their own retries, and `domcontentloaded` alone fires before React hydrates.
    await this.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    await expectAppRendered(this.page);
  }

  /**
   * In-app destinations reachable from the current page's navigation.
   *
   * At mobile widths AppShell collapses the nav behind an "Open navigation" button, so a
   * plain `nav a:visible` query returns nothing there and any test that walks the navigation
   * fails on the mobile projects for a layout reason rather than a real one. Open the overlay
   * first when the collapsed trigger is present.
   */
  async navigableHrefs(): Promise<string[]> {
    const menuButton = this.page.getByLabel('Open navigation');
    if (await menuButton.isVisible().catch(() => false)) {
      await menuButton.click();
      await expect(this.page.locator('nav a:visible').first()).toBeVisible({ timeout: 5_000 });
    }

    const hrefs = await this.page
      .locator('nav a:visible, [role="navigation"] a:visible, header a:visible')
      .evaluateAll((els) =>
        (els as HTMLAnchorElement[])
          .map((a) => a.getAttribute('href'))
          .filter((h): h is string => Boolean(h && !h.startsWith('http') && !h.startsWith('#'))),
      );
    return Array.from(new Set(hrefs));
  }

  async axeScan(opts: AxeOpts = {}): Promise<void> {
    await expectAppRendered(this.page);
    const tags = opts.tags ?? ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
    const impacts: AxeImpact[] = opts.impacts ?? ['critical', 'serious'];
    const results = await new AxeBuilder({ page: this.page }).withTags(tags).analyze();
    const filtered = results.violations.filter(
      (v) => v.impact !== null && impacts.includes(v.impact as AxeImpact),
    );
    if (filtered.length > 0) {
      const summary = filtered.map((v) => `${v.id}: ${v.help}`).join('\n  ');
      throw new Error(
        `axe found ${filtered.length} ${impacts.join('/')} violation(s) on ${this.page.url()}:\n  ${summary}`,
      );
    }
  }

  async expectSuccessfulRoute(): Promise<void> {
    await expectAppRendered(this.page);
    const failedOrLoading = this.page.getByRole('heading', {
      name: /^(?:Something went wrong|Loading study\.\.\.|Study not found(?: or unavailable)?|Unable to .*)$/i,
    });
    await expect(
      failedOrLoading,
      'A successful persona route must settle without an application, loading, or handled-error panel',
    ).toHaveCount(0, { timeout: 10_000 });
  }

  async tabCycle(steps: number): Promise<string[]> {
    const focused: string[] = [];
    for (let i = 0; i < steps; i++) {
      await this.page.keyboard.press('Tab');
      const tag = await this.page.evaluate(() => document.activeElement?.tagName ?? '');
      focused.push(tag);
    }
    return focused;
  }

  capturePageErrors(): { errors: Error[] } {
    const errors: Error[] = [];
    this.page.on('pageerror', (err) => errors.push(err));
    return { errors };
  }
}

// Shared body for AuthScope/StudyScope/ParticipantScope `asPersona` methods.
// Lifecycle: open a fresh page on the BrowserContext, run the block with a
// PersonaScope bound to it, close the page in finally. The close is best-effort
// because if the page already detached (e.g. browser crashed mid-test) we want
// the original test failure to surface, not a teardown error masking it.
export async function runPersona(
  ctx: ScenarioContext,
  name: PersonaName,
  context: BrowserContext,
  api: ApiClient,
  seed: PersonaSeed,
  block: (persona: PersonaScope) => Promise<void>,
): Promise<void> {
  const page = await context.newPage();
  try {
    await block(new PersonaScope(ctx, name, page, context, api, seed));
  } finally {
    await page.close().catch(() => undefined);
  }
}
