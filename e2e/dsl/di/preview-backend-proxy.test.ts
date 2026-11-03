import { describe, expect, test } from 'bun:test';
import { proxyToPreviewBackend } from '../../../scripts/preview-backend-proxy';
import { DIRECT_BACKEND_URL, PROXY_BASE_URL_DEFAULT } from '../constants';

describe('proxyToPreviewBackend', () => {
  test('authenticates internal requests with the configured secret and drops forged public markers', async () => {
    const secret = 'synthetic-preview-proxy-credential';
    for (const prefix of ['/chronicle/api/web', '/chronicle/v3']) {
      const url = new URL(`${prefix}/auth/testing-login`, PROXY_BASE_URL_DEFAULT);
      const request = new Request(url, {
        method: 'POST',
        headers: { 'X-Chronicle-Internal-Web': 'forged' },
        body: '{}',
      });
      const observed: (string | null)[] = [];
      const response = await proxyToPreviewBackend(
        request,
        url,
        { baseUrl: DIRECT_BACKEND_URL, internalWebSecret: secret },
        (_target, init) => {
          const marker = new Headers(init?.headers).get('X-Chronicle-Internal-Web');
          observed.push(marker);
          return Promise.resolve(new Response(null, { status: marker === secret ? 200 : 403 }));
        },
      );
      if (prefix === '/chronicle/api/web') {
        expect(response.status).toBe(200);
        expect(observed).toEqual([secret]);
      } else {
        expect(observed).toEqual([null]);
      }
    }
  });

  test('returns a safe no-store 502 when the configured backend is unavailable', async () => {
    const requestUrl = new URL('/chronicle/api/web/study', PROXY_BASE_URL_DEFAULT);
    const response = await proxyToPreviewBackend(
      new Request(requestUrl),
      requestUrl,
      { baseUrl: DIRECT_BACKEND_URL },
      () => Promise.reject(new Error('connect ECONNREFUSED private-upstream.invalid')),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      error: 'The Chronicle backend is unavailable.',
    });
  });
});
