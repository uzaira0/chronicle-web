import type { ApiClient } from '../di/api-client.js';
import { apiPost } from '../di/api-client.js';
import type { ScenarioContext } from '../scenario-context.js';
import { DataScope } from './data-scope.js';
import type { UsageEventSpec } from '../di/test-data-provider.js';

export class DeviceScope {
  readonly ctx: ScenarioContext;
  readonly client: ApiClient;
  readonly studyId: string;
  readonly participantId: string;
  readonly deviceId: string;

  constructor(ctx: ScenarioContext, client: ApiClient, studyId: string, participantId: string, deviceId: string) {
    this.ctx = ctx;
    this.client = client;
    this.studyId = studyId;
    this.participantId = participantId;
    this.deviceId = deviceId;
  }

  async upload(
    events: UsageEventSpec[] = this.ctx.providers.data.usageEvents(),
    block: (data: DataScope) => Promise<void>,
  ): Promise<void> {
    const body = events.map(e => ({
      '@class': 'com.openlattice.chronicle.android.ChronicleUsageEvent',
      studyId: this.studyId,
      participantId: this.participantId,
      ...e,
    }));
    const rowsWritten = await apiPost<number>(
      this.client,
      `/chronicle/v3/study/${this.studyId}/participant/${this.participantId}/android/${this.deviceId}`,
      body,
    );
    await block(new DataScope(
      this.ctx,
      this.client,
      this.studyId,
      this.participantId,
      rowsWritten,
    ));
  }
}
