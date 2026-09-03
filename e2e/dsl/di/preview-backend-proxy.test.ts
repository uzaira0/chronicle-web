import { describe, expect, test } from 'bun:test';
import { proxyToPreviewBackend } from '../../../scripts/preview-backend-proxy';
import { DIRECT_BACKEND_URL, PROXY_BASE_URL_DEFAULT } from '../constants';

describe('proxyToPreviewBackend', () => {
  test('returns a safe no-store 502 when the configured backend is unavailable', async () => {
    const requestUrl = new URL(
      '/chronicle/api/web/study',
      PROXY_BASE_URL_DEFAULT,
    );
    const response = await proxyToPreviewBackend(
      new Request(requestUrl),
      requestUrl,
      DIRECT_BACKEND_URL,
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
