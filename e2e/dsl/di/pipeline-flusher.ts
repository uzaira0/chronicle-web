import { FLUSH_PIPELINE_PATH } from '../constants.js';
import type { ApiClient } from './api-client.js';
import { apiPost } from './api-client.js';

export interface PipelineFlusher {
  flush(): Promise<void>;
}

export class BackendApiFlusher implements PipelineFlusher {
  private readonly client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  async flush(): Promise<void> {
    // The test-only hook drains the whole UPLOAD_BUFFER before returning; a
    // background drain already holding rows commits first.
    await apiPost<unknown>(this.client, FLUSH_PIPELINE_PATH, {});
  }
}
