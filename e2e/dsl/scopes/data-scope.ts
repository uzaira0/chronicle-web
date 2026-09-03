import type { ApiClient } from '../di/api-client.js';
import type { ScenarioContext } from '../scenario-context.js';

export class DataScope {
  readonly ctx: ScenarioContext;
  readonly client: ApiClient;
  readonly studyId: string;
  readonly participantId: string;
  readonly rowsWritten: number;

  constructor(ctx: ScenarioContext, client: ApiClient, studyId: string, participantId: string, rowsWritten: number) {
    this.ctx = ctx;
    this.client = client;
    this.studyId = studyId;
    this.participantId = participantId;
    this.rowsWritten = rowsWritten;
  }

  async flush(): Promise<void> {
    const flusher = this.ctx.providers.flusherFor(this.client);
    await flusher.flush(this.studyId, this.participantId);
  }

  async verify(block: (data: DataScope) => Promise<void>): Promise<void> {
    await block(this);
  }
}
