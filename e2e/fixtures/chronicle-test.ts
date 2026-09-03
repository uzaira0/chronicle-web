import { test as base } from './browser-test.js';
import { defaultProviders } from '../dsl/di/providers-bundle.js';
import { chronicleScenario } from '../dsl/entry-point.js';
import type { ScenarioScope } from '../dsl/scopes/scenario-scope.js';
import type { ProvidersBundle } from '../dsl/di/providers-bundle.js';
import { PROXY_BASE_URL_DEFAULT } from '../dsl/constants.js';

export type ChronicleFixtures = {
  providers: ProvidersBundle;
  scenario: (block: (s: ScenarioScope) => Promise<void>) => Promise<void>;
};

export const chronicleTest = base.extend<ChronicleFixtures>({
  providers: async ({ context }, use, testInfo) => {
    const baseUrl = testInfo.project.use.baseURL ?? PROXY_BASE_URL_DEFAULT;
    await use(defaultProviders(context, baseUrl));
  },

  scenario: async ({ context, providers }, use) => {
    const run = (block: (s: ScenarioScope) => Promise<void>) =>
      chronicleScenario(context, providers, block);
    await use(run);
  },
});

export { expect } from './browser-test.js';
