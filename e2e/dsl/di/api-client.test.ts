import { describe, expect, it, mock } from 'bun:test';
import type {
  APIRequestContext,
  APIResponse,
  BrowserContext,
  Cookie,
} from '@playwright/test';
import { apiDeleteDurably, apiPost, currentCsrfToken } from './api-client';
import {
  CSRF_COOKIE_NAME,
  HEADER_CONTENT_TYPE,
  HEADER_CSRF_TOKEN,
  MIME_JSON,
} from '../constants';

function fakeContext(cookies: Cookie[]): BrowserContext {
  return {
    cookies: () => Promise.resolve(cookies),
  } as unknown as BrowserContext;
}

const baseCookie: Omit<Cookie, 'name' | 'value'> = {
  domain: '127.0.0.1',
  path: '/',
  expires: -1,
  httpOnly: false,
  secure: false,
  sameSite: 'Lax',
};

describe('currentCsrfToken', () => {
  it('returns the value of the ol_csrf_token cookie when present', async () => {
    const ctx = fakeContext([
      { ...baseCookie, name: CSRF_COOKIE_NAME, value: 'abc-123' },
      { ...baseCookie, name: 'unrelated', value: 'x' },
    ]);
    expect(await currentCsrfToken(ctx)).toBe('abc-123');
  });

  it('throws a clear "did asUser() run?" error when the cookie is missing', async () => {
    const ctx = fakeContext([{ ...baseCookie, name: 'unrelated', value: 'x' }]);
    await expect(currentCsrfToken(ctx)).rejects.toThrow(/did asUser\(\) run/);
  });

  it('throws when the cookie exists but has an empty value (rotation race)', async () => {
    const ctx = fakeContext([{ ...baseCookie, name: CSRF_COOKIE_NAME, value: '' }]);
    await expect(currentCsrfToken(ctx)).rejects.toThrow(/did asUser\(\) run/);
  });

  it('reads each call (does not cache) — supports rotation between calls', async () => {
    let value = 'first';
    const ctx = {
      cookies: () => Promise.resolve([{ ...baseCookie, name: CSRF_COOKIE_NAME, value }]),
    } as unknown as BrowserContext;
    expect(await currentCsrfToken(ctx)).toBe('first');
    value = 'rotated';
    expect(await currentCsrfToken(ctx)).toBe('rotated');
  });
});

describe('apiDeleteDurably', () => {
  it('uses standalone request state and a fixed CSRF token', async () => {
    const deleteMock = mock(() => Promise.resolve({ ok: () => true } as APIResponse));
    const request = {
      delete: deleteMock,
    } as unknown as APIRequestContext;

    await apiDeleteDurably(
      {
        request,
        baseUrl: 'http://127.0.0.1:4174',
        csrfToken: 'cleanup-csrf',
      },
      '/chronicle/v3/study/study-id',
    );

    expect(deleteMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4174/chronicle/v3/study/study-id',
      {
        data: undefined,
        headers: {
          [HEADER_CONTENT_TYPE]: MIME_JSON,
          [HEADER_CSRF_TOKEN]: 'cleanup-csrf',
        },
      },
    );
  });
});

describe('apiPost', () => {
  // The server refuses create POSTs without an Idempotency-Key (HTTP 428), as the dashboard sends.
  it('sends a fresh Idempotency-Key per call and lets the caller pin one', async () => {
    const postMock = mock<(url: string, options: { headers: Record<string, string> }) => Promise<APIResponse>>(() =>
      Promise.resolve({ ok: () => true, json: () => Promise.resolve('id') } as APIResponse),
    );
    const client = {
      request: { post: postMock } as unknown as APIRequestContext,
      baseUrl: 'http://127.0.0.1:4174',
      context: fakeContext([{ ...baseCookie, name: CSRF_COOKIE_NAME, value: 'csrf' }]),
      token: '',
    };

    await apiPost(client, '/chronicle/v3/study', {});
    await apiPost(client, '/chronicle/v3/study', {});
    await apiPost(client, '/chronicle/v3/study', {}, { 'Idempotency-Key': 'retry-1' });

    const keys = postMock.mock.calls.map(([, options]) => options.headers['Idempotency-Key']);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[2]).toBe('retry-1');
  });
});
