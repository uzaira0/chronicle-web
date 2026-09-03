import type { APIRequestContext, BrowserContext } from '@playwright/test';
import {
  CSRF_COOKIE_NAME,
  HEADER_CONTENT_TYPE,
  HEADER_CSRF_TOKEN,
  MIME_JSON,
} from '../constants.js';

// Cookie+CSRF auth, reading the CSRF token dynamically from BrowserContext
// cookies. The token is rotated whenever the page's bootstrap-auth flow re-runs
// (which it does on every fresh page load), so caching a single value goes stale
// quickly. `chronicle_auth` rides on context.request automatically.
export interface ApiClient {
  request: APIRequestContext;
  baseUrl: string;
  context: BrowserContext;
  // The bootstrap-time JWT — preserved for personas that need raw Authorization-header probes.
  token: string;
}

export interface DurableCleanupClient {
  request: APIRequestContext;
  baseUrl: string;
  csrfToken: string;
}

export async function currentCsrfToken(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies();
  const csrf = cookies.find((c) => c.name === CSRF_COOKIE_NAME);
  if (!csrf || !csrf.value) {
    throw new Error(`no ${CSRF_COOKIE_NAME} cookie on BrowserContext — did asUser() run?`);
  }
  return csrf.value;
}

async function authHeaders(client: ApiClient, contentType?: string): Promise<Record<string, string>> {
  const h: Record<string, string> = { [HEADER_CSRF_TOKEN]: await currentCsrfToken(client.context) };
  if (contentType) h[HEADER_CONTENT_TYPE] = contentType;
  return h;
}

export async function apiGet<T>(client: ApiClient, path: string): Promise<T> {
  const response = await client.request.get(`${client.baseUrl}${path}`, {
    headers: await authHeaders(client),
  });
  if (!response.ok()) {
    throw new Error(`GET ${path} failed: HTTP ${response.status()} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPost<T>(client: ApiClient, path: string, body: unknown): Promise<T> {
  const response = await client.request.post(`${client.baseUrl}${path}`, {
    data: JSON.stringify(body),
    headers: await authHeaders(client, MIME_JSON),
  });
  if (!response.ok()) {
    throw new Error(`POST ${path} failed: HTTP ${response.status()} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export async function apiDelete(client: ApiClient, path: string, body?: unknown): Promise<void> {
  const response = await client.request.delete(`${client.baseUrl}${path}`, {
    data: body as Record<string, unknown> | undefined,
    headers: await authHeaders(client, MIME_JSON),
  });
  if (!response.ok()) {
    throw new Error(`DELETE ${path} failed: HTTP ${response.status()} ${await response.text()}`);
  }
}

export async function apiDeleteDurably(
  client: DurableCleanupClient,
  path: string,
  body?: unknown,
): Promise<void> {
  const response = await client.request.delete(`${client.baseUrl}${path}`, {
    data: body as Record<string, unknown> | undefined,
    headers: {
      [HEADER_CONTENT_TYPE]: MIME_JSON,
      [HEADER_CSRF_TOKEN]: client.csrfToken,
    },
  });
  if (!response.ok()) {
    throw new Error(`DELETE ${path} failed: HTTP ${response.status()} ${await response.text()}`);
  }
}

export async function apiGetBytes(client: ApiClient, path: string): Promise<Buffer> {
  const response = await client.request.get(`${client.baseUrl}${path}`, {
    headers: await authHeaders(client),
  });
  if (!response.ok()) {
    throw new Error(`GET ${path} failed: HTTP ${response.status()} ${await response.text()}`);
  }
  return response.body();
}
