import type { components } from '../../../src/modern/types/chronicle-api.generated';
import type { ApiClient } from '../di/api-client.js';
import { apiPost } from '../di/api-client.js';
import type { UsageEventSpec } from '../di/test-data-provider.js';
import MOBILE_HEADERS from '../mobile-headers.json';
import type { ScenarioContext } from '../scenario-context.js';
import { DataScope } from './data-scope.js';

type UploadReceipt = components['schemas']['UploadReceipt'];
type EnrolledDevice = { studyId: string; participantId: string; randomDeviceId: string; apiKey: string };

export class DeviceScope {
  readonly ctx: ScenarioContext;
  readonly clients: { researcher: ApiClient; mobile: ApiClient };
  readonly enrollment: EnrolledDevice;

  constructor(ctx: ScenarioContext, clients: { researcher: ApiClient; mobile: ApiClient }, enrollment: EnrolledDevice) {
    this.ctx = ctx;
    this.clients = clients;
    this.enrollment = enrollment;
  }

  async upload(
    events: UsageEventSpec[] = this.ctx.providers.data.usageEvents(),
    block: (data: DataScope) => Promise<void>,
  ): Promise<void> {
    const body = events.map((e) => ({
      '@class': 'com.openlattice.chronicle.android.ChronicleUsageEvent',
      studyId: this.enrollment.studyId,
      participantId: this.enrollment.participantId,
      ...e,
    }));
    const receipt = await apiPost<UploadReceipt>(
      this.clients.mobile,
      `/chronicle/v4/study/${this.enrollment.studyId}/participant/${this.enrollment.participantId}/android`,
      body,
      { [MOBILE_HEADERS.randomDeviceId]: this.enrollment.randomDeviceId, [MOBILE_HEADERS.apiKey]: this.enrollment.apiKey },
    );
    await block(
      new DataScope(
        this.ctx,
        this.clients.researcher,
        this.enrollment.studyId,
        this.enrollment.participantId,
        receipt.acceptedIds.length,
      ),
    );
  }

  /** The phone's redacted upload-diagnostics report; returns the IDs the server stored. */
  async uploadDiagnostics(events: Record<string, unknown>[]): Promise<string[]> {
    const receipt = await apiPost<UploadReceipt>(
      this.clients.mobile,
      `/chronicle/v4/study/${this.enrollment.studyId}/participant/${this.enrollment.participantId}/android/upload-diagnostics`,
      events,
      {
        [MOBILE_HEADERS.randomDeviceId]: this.enrollment.randomDeviceId,
        [MOBILE_HEADERS.apiKey]: this.enrollment.apiKey,
      },
    );
    return receipt.acceptedIds;
  }
}
