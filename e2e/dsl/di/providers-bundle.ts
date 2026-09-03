import type { BrowserContext } from '@playwright/test';
import type { AuthStrategy } from './auth-strategy.js';
import type { TestDataProvider } from './test-data-provider.js';
import type { PipelineFlusher } from './pipeline-flusher.js';
import { TestingLoginStrategy } from './auth-strategy.js';
import { DefaultTestDataProvider } from './test-data-provider.js';
import { BackendApiFlusher } from './pipeline-flusher.js';
import type { ApiClient } from './api-client.js';

export interface ProvidersBundle {
  baseUrl: string;
  auth: AuthStrategy;
  data: TestDataProvider;
  flusherFor(client: ApiClient): PipelineFlusher;
}

export function defaultProviders(_context: BrowserContext, baseUrl: string): ProvidersBundle {
  return {
    baseUrl,
    auth: new TestingLoginStrategy(baseUrl),
    data: new DefaultTestDataProvider(),
    flusherFor: (client) => new BackendApiFlusher(client),
  };
}
