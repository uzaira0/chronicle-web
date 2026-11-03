import { describe, expect, mock, test } from 'bun:test';
import type { APIRequestContext, APIResponse, BrowserContext } from '@playwright/test';
import { CSRF_COOKIE_NAME, FLUSH_PIPELINE_PATH, HEADER_CONTENT_TYPE, HEADER_CSRF_TOKEN, HEADER_IDEMPOTENCY_KEY, MIME_JSON } from '../constants';
import type { ApiClient } from './api-client';
import { BackendApiFlusher } from './pipeline-flusher';

describe('BackendApiFlusher', () => {
  test('posts the whole-buffer flush with the dashboard headers', async () => {
    const post = mock<(url: string, options: { data: string; headers: Record<string, string> }) => Promise<APIResponse>>(() =>
      Promise.resolve({ json: () => Promise.resolve({}), ok: () => true } as APIResponse),
    );
    const client: ApiClient = {
      baseUrl: 'http://127.0.0.1:4175',
      context: {
        cookies: () =>
          Promise.resolve([
            {
              domain: '127.0.0.1',
              expires: -1,
              httpOnly: false,
              name: CSRF_COOKIE_NAME,
              path: '/',
              sameSite: 'Lax',
              secure: false,
              value: 'csrf-token',
            },
          ]),
      } as unknown as BrowserContext,
      request: { post } as unknown as APIRequestContext,
      token: 'test-token',
    };

    await new BackendApiFlusher(client).flush();

    const [url, options] = post.mock.calls[0] ?? [];
    const idempotencyKey = options?.headers[HEADER_IDEMPOTENCY_KEY] ?? '';
    expect(url).toBe(`http://127.0.0.1:4175${FLUSH_PIPELINE_PATH}`);
    expect(idempotencyKey).toMatch(/^[\da-f-]{36}$/);
    expect(options).toEqual({
      data: JSON.stringify({}),
      headers: {
        [HEADER_CONTENT_TYPE]: MIME_JSON,
        [HEADER_CSRF_TOKEN]: 'csrf-token',
        [HEADER_IDEMPOTENCY_KEY]: idempotencyKey,
      },
    });
  });
});
