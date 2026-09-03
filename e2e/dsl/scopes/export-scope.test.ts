import { describe, expect, it, mock } from 'bun:test';
import type { APIRequestContext, APIResponse, BrowserContext, Cookie } from '@playwright/test';
import { CSRF_COOKIE_NAME } from '../constants.js';
import type { ApiClient } from '../di/api-client.js';
import type { ScenarioContext } from '../scenario-context.js';
import { ExportScope } from './export-scope.js';

const csrfCookie: Cookie = {
  name: CSRF_COOKIE_NAME,
  value: 'csrf-test-value',
  domain: '127.0.0.1',
  path: '/',
  expires: -1,
  httpOnly: false,
  secure: false,
  sameSite: 'Lax',
};

function response(body: unknown): APIResponse {
  return {
    ok: () => true,
    json: () => Promise.resolve(body),
    body: () => Promise.resolve(Buffer.from('export-bytes')),
  } as unknown as APIResponse;
}

function clientForStatus(status: string): {
  client: ApiClient;
  get: ReturnType<typeof mock>;
} {
  const get = mock((url: string) => {
    if (url.endsWith('/download')) {
      return Promise.resolve(response(null));
    }
    return Promise.resolve(
      response({
        exportId: 'export-id',
        studyId: 'study-id',
        status,
        format: 'CSV',
        createdAt: '2026-07-28T00:00:00Z',
        downloadToken: null,
      }),
    );
  });
  const context = {
    cookies: () => Promise.resolve([csrfCookie]),
  } as unknown as BrowserContext;
  const request = { get } as unknown as APIRequestContext;
  return {
    client: {
      request,
      baseUrl: 'http://127.0.0.1:4174',
      context,
      token: 'unused-test-token',
    },
    get,
  };
}

describe('ExportScope.download', () => {
  it('downloads a completed export through the authenticated route without a query token', async () => {
    const { client, get } = clientForStatus('COMPLETED');
    const scope = new ExportScope(
      {} as ScenarioContext,
      client,
      'study-id',
      'export-id',
    );

    expect(await scope.download()).toEqual(Buffer.from('export-bytes'));
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1]?.[0]).toBe(
      'http://127.0.0.1:4174/chronicle/v3/study/study-id/export/export-id/download',
    );
  });

  it('refuses to download an export that is not complete', async () => {
    const { client, get } = clientForStatus('FAILED');
    const scope = new ExportScope(
      {} as ScenarioContext,
      client,
      'study-id',
      'export-id',
    );

    await expect(scope.download()).rejects.toThrow(
      'Export export-id is not complete; status=FAILED',
    );
    expect(get).toHaveBeenCalledTimes(1);
  });
});
