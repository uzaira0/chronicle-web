import { FLUSH_PIPELINE_PATH } from '../constants.js';
import type { ApiClient } from './api-client.js';
import { apiPost } from './api-client.js';

export interface PipelineFlusher {
  flush(studyId: string, participantId: string): Promise<void>;
}

export class BackendApiFlusher implements PipelineFlusher {
  private readonly client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  async flush(studyId: string, participantId: string): Promise<void> {
    // The test-only hook drains this subject's UPLOAD_BUFFER rows before
    // returning, so another worker cannot claim the row and make an export
    // race an uncommitted global flush.
    await apiPost<unknown>(this.client, FLUSH_PIPELINE_PATH, { participantId, studyId });
  }
}
