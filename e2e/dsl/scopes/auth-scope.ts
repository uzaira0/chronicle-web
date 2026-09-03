import type { BrowserContext } from '@playwright/test';
import type {
  ApiClient,
  DurableCleanupClient,
} from '../di/api-client.js';
import { apiDeleteDurably, apiPost } from '../di/api-client.js';
import type { ScenarioContext } from '../scenario-context.js';
import { StudyScope } from './study-scope.js';
import type { StudySpec } from '../di/test-data-provider.js';
import { runPersona, type PersonaName, type PersonaScope } from './persona-scope.js';

export class AuthScope {
  readonly ctx: ScenarioContext;
  readonly userId: string;
  readonly client: ApiClient;
  readonly cleanupClient: DurableCleanupClient;
  readonly context: BrowserContext;

  constructor(
    ctx: ScenarioContext,
    userId: string,
    client: ApiClient,
    cleanupClient: DurableCleanupClient,
    context: BrowserContext,
  ) {
    this.ctx = ctx;
    this.userId = userId;
    this.client = client;
    this.cleanupClient = cleanupClient;
    this.context = context;
  }

  async study(
    spec: StudySpec = this.ctx.providers.data.study(),
    block: (study: StudyScope) => Promise<void>,
  ): Promise<void> {
    const studyId = await apiPost<string>(this.client, '/chronicle/v3/study', spec);
    this.ctx.pushCleanup(() =>
      apiDeleteDurably(
        this.cleanupClient,
        `/chronicle/v3/study/${studyId}`,
      ),
    );
    await block(
      new StudyScope(
        this.ctx,
        this.userId,
        this.client,
        this.cleanupClient,
        this.context,
        studyId,
        spec.title,
      ),
    );
  }

  async asPersona(
    name: PersonaName,
    block: (persona: PersonaScope) => Promise<void>,
  ): Promise<void> {
    await runPersona(this.ctx, name, this.context, this.client, {}, block);
  }
}
