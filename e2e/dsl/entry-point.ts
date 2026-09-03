import type { BrowserContext } from '@playwright/test';
import type { ProvidersBundle } from './di/providers-bundle.js';
import { ScenarioContext } from './scenario-context.js';
import { ScenarioScope } from './scopes/scenario-scope.js';

export async function chronicleScenario(
  context: BrowserContext,
  providers: ProvidersBundle,
  block: (s: ScenarioScope) => Promise<void>,
): Promise<void> {
  const ctx = new ScenarioContext(providers);
  try {
    await block(new ScenarioScope(ctx, context));
  } catch (error) {
    await ctx.cleanup.runAll(true);
    throw error;
  }
  await ctx.cleanup.runAll(false);
}
