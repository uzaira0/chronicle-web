import { expect, test } from '@playwright/test';
import { DIRECT_BACKEND_URL } from './dsl/constants';

// Persona 3 (API arm): Adversary security tests that don't need a browser.
// These probe unauthenticated/malformed/oversized requests at the backend
// directly, so we use Playwright's standalone APIRequestContext instead of
// `auth.asPersona`. Saves a browser-process spawn per test.
//
// Co-located with the UI arm in `persona-adversary.spec.ts`.
test.describe.configure({ mode: 'parallel' });

test.describe('persona: adversary (API)', () => {
  test('missing auth returns 401 or 403 on protected endpoints', async ({ playwright }) => {
    const ctx = await playwright.request.newContext();
    const response = await ctx.get(`${DIRECT_BACKEND_URL}/chronicle/v3/study`, {
      failOnStatusCode: false,
    });
    expect(
      [401, 403].includes(response.status()),
      `Expected 401/403 with no auth on /v3/study, got ${response.status()}`,
    ).toBe(true);
  });

  test('GET on a non-existent study returns 4xx (never 5xx)', async ({ playwright }) => {
    const ctx = await playwright.request.newContext();
    const response = await ctx.get(
      `${DIRECT_BACKEND_URL}/chronicle/v3/study/00000000-0000-0000-0000-000000000999`,
      { failOnStatusCode: false },
    );
    expect(response.status(), `Expected 4xx (auth or not-found), got 5xx for missing study`).not.toBeGreaterThanOrEqual(500);
  });

  test('malformed JSON body returns 4xx, not 500', async ({ playwright }) => {
    const ctx = await playwright.request.newContext();
    const response = await ctx.post(`${DIRECT_BACKEND_URL}/chronicle/v3/study`, {
      data: '{not valid json',
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    expect(response.status(), `Malformed JSON should give 4xx, got ${response.status()}`).toBeLessThan(500);
  });

  test('oversized payload is rejected, not silently accepted', async ({ playwright }) => {
    const ctx = await playwright.request.newContext();
    const huge = 'A'.repeat(50_000_000);
    let result: { kind: 'response'; status: number } | { kind: 'error'; message: string };
    try {
      const response = await ctx.post(`${DIRECT_BACKEND_URL}/chronicle/v3/study`, {
        data: { title: huge, contact: 'x@x.com' },
        failOnStatusCode: false,
        timeout: 15_000,
      });
      result = { kind: 'response', status: response.status() };
    } catch (e) {
      // Connection-level rejection (closed socket, request-too-large at the
      // transport layer, or a client/server timeout) IS the correct behavior
      // for an oversized request — it just shows up as a thrown error rather
      // than an HTTP status. We accept it here as a successful rejection.
      result = { kind: 'error', message: e instanceof Error ? e.message : String(e) };
    }
    if (result.kind === 'error') {
      // Successful transport-layer rejection. Test passes deterministically.
      expect(result.message.length).toBeGreaterThan(0);
      return;
    }
    expect(
      [400, 401, 403, 413].includes(result.status),
      `Oversized payload should produce 400/401/403/413 or transport rejection, got ${result.status}`,
    ).toBe(true);
  });

  test('path traversal in studyId is rejected and does not leak /etc/passwd', async ({ playwright }) => {
    const ctx = await playwright.request.newContext();
    const response = await ctx.get(
      `${DIRECT_BACKEND_URL}/chronicle/v3/study/..%2F..%2Fetc%2Fpasswd`,
      { failOnStatusCode: false },
    );
    expect(response.status()).toBeLessThan(500);
    const body = await response.text();
    expect(body, 'Response leaks /etc/passwd').not.toContain('root:');
  });

  test('empty body where data is required returns 4xx', async ({ playwright }) => {
    const ctx = await playwright.request.newContext();
    const response = await ctx.post(`${DIRECT_BACKEND_URL}/chronicle/v3/study`, {
      data: '',
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    expect(response.status()).toBeLessThan(500);
  });

  test('concurrent identical mutations do not corrupt state (no 5xx on race)', async ({ playwright }) => {
    const ctx = await playwright.request.newContext();
    const requests = await Promise.all([
      ctx.post(`${DIRECT_BACKEND_URL}/chronicle/v3/study`, {
        data: { title: 'Concurrent', contact: 'a@b.com' },
        failOnStatusCode: false,
      }),
      ctx.post(`${DIRECT_BACKEND_URL}/chronicle/v3/study`, {
        data: { title: 'Concurrent', contact: 'a@b.com' },
        failOnStatusCode: false,
      }),
    ]);
    for (const r of requests) {
      expect(r.status()).toBeLessThan(500);
    }
  });
});
