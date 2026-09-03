import { CleanupStack } from './cleanup/cleanup-stack.js';
import type { ProvidersBundle } from './di/providers-bundle.js';

export class ScenarioContext {
  readonly cleanup = new CleanupStack();
  readonly providers: ProvidersBundle;

  constructor(providers: ProvidersBundle) {
    this.providers = providers;
  }

  pushCleanup(action: () => Promise<void>): void {
    this.cleanup.push(action);
  }
}
