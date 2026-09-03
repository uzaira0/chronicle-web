import { describe, expect, mock, test } from 'bun:test';
import type { APIRequestContext, APIResponse, BrowserContext } from '@playwright/test';
import { CSRF_COOKIE_NAME, FLUSH_PIPELINE_PATH, HEADER_CONTENT_TYPE, HEADER_CSRF_TOKEN, MIME_JSON } from '../constants';
import type { ApiClient } from './api-client';
import { BackendApiFlusher } from './pipeline-flusher';

describe('BackendApiFlusher', () => {
  test('scopes the flush to the uploaded study and participant', async () => {
    const post = mock(() =>
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

    await new BackendApiFlusher(client).flush('study-id', 'participant-id');

    expect(post).toHaveBeenCalledWith(`http://127.0.0.1:4175${FLUSH_PIPELINE_PATH}`, {
      data: JSON.stringify({ participantId: 'participant-id', studyId: 'study-id' }),
      headers: {
        [HEADER_CONTENT_TYPE]: MIME_JSON,
        [HEADER_CSRF_TOKEN]: 'csrf-token',
      },
    });
  });
});
