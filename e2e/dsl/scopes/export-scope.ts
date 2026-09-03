import type { ApiClient } from '../di/api-client.js';
import { apiGet, apiGetBytes } from '../di/api-client.js';
import type { ScenarioContext } from '../scenario-context.js';
import type { ExportJobInfo } from './study-scope.js';

export class ExportScope {
  readonly ctx: ScenarioContext;
  readonly client: ApiClient;
  readonly studyId: string;
  readonly exportId: string;
  private lastInfo: ExportJobInfo | null = null;

  constructor(ctx: ScenarioContext, client: ApiClient, studyId: string, exportId: string) {
    this.ctx = ctx;
    this.client = client;
    this.studyId = studyId;
    this.exportId = exportId;
  }

  async awaitCompletion(opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<ExportJobInfo> {
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const intervalMs = opts.intervalMs ?? 200;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const info = await apiGet<ExportJobInfo>(
        this.client,
        `/chronicle/v3/study/${this.studyId}/export/${this.exportId}`,
      );
      if (info.status === 'COMPLETED' || info.status === 'FAILED') {
        this.lastInfo = info;
        return info;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    const last = await apiGet<ExportJobInfo>(
      this.client,
      `/chronicle/v3/study/${this.studyId}/export/${this.exportId}`,
    );
    this.lastInfo = last;
    throw new Error(
      `Export ${this.exportId} did not complete within ${timeoutMs}ms; last status: ${last.status}`
    );
  }

  async download(): Promise<Buffer> {
    if (!this.lastInfo) {
      this.lastInfo = await apiGet<ExportJobInfo>(
        this.client,
        `/chronicle/v3/study/${this.studyId}/export/${this.exportId}`,
      );
    }
    if (this.lastInfo.status !== 'COMPLETED') {
      throw new Error(
        `Export ${this.exportId} is not complete; status=${this.lastInfo.status}`
      );
    }
    return apiGetBytes(
      this.client,
      `/chronicle/v3/study/${this.studyId}/export/${this.exportId}/download`
    );
  }
}
