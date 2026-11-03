import type { BrowserContext } from '@playwright/test';
import type {
  ApiClient,
  DurableCleanupClient,
} from '../di/api-client.js';
import { apiDeleteDurably, apiGetBytes, apiPost } from '../di/api-client.js';
import type { ScenarioContext } from '../scenario-context.js';
import { ParticipantScope } from './participant-scope.js';
import type { ParticipantSpec } from '../di/test-data-provider.js';
import { runPersona, type PersonaName, type PersonaScope } from './persona-scope.js';

export class StudyScope {
  readonly ctx: ScenarioContext;
  readonly userId: string;
  readonly client: ApiClient;
  readonly cleanupClient: DurableCleanupClient;
  readonly context: BrowserContext;
  readonly id: string;
  readonly title: string;

  constructor(
    ctx: ScenarioContext,
    userId: string,
    client: ApiClient,
    cleanupClient: DurableCleanupClient,
    context: BrowserContext,
    id: string,
    title: string,
  ) {
    this.ctx = ctx;
    this.userId = userId;
    this.client = client;
    this.cleanupClient = cleanupClient;
    this.context = context;
    this.id = id;
    this.title = title;
  }

  async participant(
    spec: ParticipantSpec = this.ctx.providers.data.participant(),
    block: (participant: ParticipantScope) => Promise<void>,
  ): Promise<void> {
    await apiPost<string>(
      this.client,
      `/chronicle/v3/study/${this.id}/participant`,
      {
        participantId: spec.participantId,
        participationStatus: 'ENROLLED',
        candidate: {},
      }
    );
    this.ctx.pushCleanup(() =>
      // Backend expects Set<String> which Jackson reads from a JSON array; Set serializes as {}.
      apiDeleteDurably(
        this.cleanupClient,
        `/chronicle/v3/study/${this.id}/participants`,
        [spec.participantId],
      )
    );
    await block(new ParticipantScope(this.ctx, this.userId, this.client, this.context, this.id, spec.participantId));
  }

  /** The synchronous CSV export the dashboard downloads, for the given participants. */
  async exportCsv(dataType: string, participantIds: string[]): Promise<Buffer> {
    const query = new URLSearchParams({ dataType });
    for (const id of participantIds) query.append('participantId', id);
    return apiGetBytes(this.client, `/chronicle/v3/study/${this.id}/participants/data?${query.toString()}`);
  }

  async asPersona(
    name: PersonaName,
    block: (persona: PersonaScope) => Promise<void>,
  ): Promise<void> {
    await runPersona(this.ctx, name, this.context, this.client, { studyId: this.id }, block);
  }
}
