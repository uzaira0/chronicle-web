import { type APIRequestContext, type PlaywrightWorkerArgs, expect, test } from '@playwright/test';
import {
  DIRECT_BACKEND_URL,
  HEADER_CONTENT_TYPE,
  HEADER_CSRF_TOKEN,
  MIME_JSON,
  TESTING_LOGIN_PATH,
} from './dsl/constants';

const STUDY_PATH = `${DIRECT_BACKEND_URL}/chronicle/v3/study`;

// A validation probe only proves the backend validates if the request gets past
// authentication first — otherwise every malformed body "passes" on a blanket 401.
// Cookie+CSRF, matching the DSL's auth path (see dsl/di/api-client.ts).
async function authenticated(
  playwright: PlaywrightWorkerArgs['playwright'],
): Promise<{ csrf: string; json: Record<string, string>; request: APIRequestContext }> {
  const request = await playwright.request.newContext();
  const login = await request.post(`${DIRECT_BACKEND_URL}${TESTING_LOGIN_PATH}`, {
    data: { userId: 'test_user1' },
    failOnStatusCode: false,
    headers: { [HEADER_CONTENT_TYPE]: MIME_JSON },
  });
  expect(login.status(), `testing-login must succeed before probing validation`).toBe(200);
  const { csrfToken } = (await login.json()) as { csrfToken?: string };
  expect(csrfToken, 'testing-login returned no csrfToken').toBeTruthy();
  const csrf = csrfToken as string;
  return { csrf, json: { [HEADER_CONTENT_TYPE]: MIME_JSON, [HEADER_CSRF_TOKEN]: csrf }, request };
}

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

  test('malformed JSON body is rejected as a bad request, not an auth failure', async ({ playwright }) => {
    const { json, request } = await authenticated(playwright);
    const response = await request.post(STUDY_PATH, {
      data: '{not valid json',
      headers: json,
      failOnStatusCode: false,
    });
    expect(response.status(), `Authenticated malformed JSON must be 400 Bad Request`).toBe(400);
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
      // A server that closes the connection on an oversized body IS rejecting it — it
      // just surfaces as a thrown error rather than a status. Only that shape counts:
      // a refused connection, a DNS failure, or a plain timeout says nothing about
      // whether the payload was rejected, so those fail the test instead of passing it.
      result = { kind: 'error', message: e instanceof Error ? e.message : String(e) };
    }
    if (result.kind === 'error') {
      expect(
        /socket hang up|ECONNRESET|EPIPE|write EPROTO|stream closed|request entity too large|connection closed/i.test(
          result.message,
        ),
        `Oversized payload must be rejected by the server, not lost to connectivity or a timeout: ${result.message}`,
      ).toBe(true);
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

  test('empty body where data is required is rejected as a bad request', async ({ playwright }) => {
    const { json, request } = await authenticated(playwright);
    const response = await request.post(STUDY_PATH, {
      data: '',
      headers: json,
      failOnStatusCode: false,
    });
    expect(response.status(), `Authenticated empty body must be 400 Bad Request`).toBe(400);
  });

  test('concurrent identical creates both commit as distinct, readable studies', async ({ playwright }) => {
    const { json, request } = await authenticated(playwright);
    const title = `Concurrent ${crypto.randomUUID()}`;
    const create = () =>
      request.post(STUDY_PATH, { data: { contact: 'a@b.com', title }, failOnStatusCode: false, headers: json });
    const responses = await Promise.all([create(), create()]);

    const ids: string[] = [];
    for (const response of responses) {
      expect(response.status(), `Concurrent create failed: ${await response.text()}`).toBe(200);
      ids.push(((await response.json()) as string).replaceAll('"', ''));
    }
    // Same title twice is two studies, not one overwritten one — and each must be
    // readable afterwards, which is the state assertion a status-only check skipped.
    expect(new Set(ids).size, `Concurrent creates collapsed onto one id: ${ids.join(', ')}`).toBe(2);

    try {
      for (const id of ids) {
        const read = await request.get(`${STUDY_PATH}/${id}`, { failOnStatusCode: false, headers: json });
        expect(read.status(), `Study ${id} not readable after the concurrent create`).toBe(200);
        expect((await read.json()) as { title?: string }).toMatchObject({ title });
      }
    } finally {
      for (const id of ids) {
        await request.delete(`${STUDY_PATH}/${id}`, { failOnStatusCode: false, headers: json });
      }
    }
  });
});
