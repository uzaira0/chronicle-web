import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { routeFetch } from '@/test/http-fixtures';
import { installBrowserEnv, uninstallBrowserEnv } from '../test/browser-env';
import { AUTH_LOGOUT_ENDPOINT, AUTH_SESSION_ENDPOINT } from './auth-endpoints';
import { logoutSession, SIGN_OUT_FAILED_MESSAGE } from './auth-utils';
import { initializeBootstrapSession } from './bootstrap-auth';

describe('logoutSession()', () => {
  type FetchCall = { init: RequestInit | undefined; input: RequestInfo | URL };
  let fetchCalls: FetchCall[];

  function installFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
    const fixture = routeFetch({
      [`POST ${AUTH_LOGOUT_ENDPOINT}`]: (request) => impl(request),
      [`GET ${AUTH_SESSION_ENDPOINT}`]: (request) => impl(request),
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: (input: RequestInfo | URL, init?: RequestInit) => {
        fetchCalls.push({ init, input });
        return fixture(input, init);
      },
      writable: true,
    });
  }

  beforeEach(() => {
    fetchCalls = [];
    installBrowserEnv({ url: 'https://chronicle.test/studies/abc' });
    // Provide a spy-able window.location.replace.
    (window.location as unknown as { replace: (u: string) => void }).replace = (url: string) => {
      (window as unknown as { __replaced: string }).__replaced = url;
    };
  });

  afterEach(() => {
    uninstallBrowserEnv();
    delete (globalThis as Partial<typeof globalThis>).fetch;
  });

  it('POSTs the logout endpoint with same-origin credentials', async () => {
    installFetch(() => Promise.resolve(new Response(null, { status: 200 })));
    await logoutSession();

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.input).toBe(AUTH_LOGOUT_ENDPOINT);
    expect(fetchCalls[0]?.init?.method).toBe('POST');
    expect(fetchCalls[0]?.init?.credentials).toBe('same-origin');
  });

  it('reloads to the origin root', async () => {
    installFetch(() => Promise.resolve(new Response(null, { status: 200 })));
    await logoutSession();

    expect((window as unknown as { __replaced: string }).__replaced).toBe('https://chronicle.test/');
  });

  it('remains signed out after logout and bootstrap even when the server advertises testing login', async () => {
    const responses = routeFetch({
      [`GET ${AUTH_SESSION_ENDPOINT}`]: () => Response.json({ authenticated: false, testingLoginEnabled: true }),
      [`POST ${AUTH_LOGOUT_ENDPOINT}`]: () => Response.json({ authenticated: true }),
    });
    installFetch(responses);
    await logoutSession();
    const session = await initializeBootstrapSession();

    expect(fetchCalls.map((call) => call.input)).toEqual([AUTH_LOGOUT_ENDPOINT, AUTH_SESSION_ENDPOINT]);
    expect(session.status).toBe('awaiting-sso');
    expect(session.user).toBeNull();
  });

  it('rejects without reloading when the logout fetch fails', async () => {
    installFetch(() => Promise.reject(new Error('network down')));

    await expect(logoutSession()).rejects.toThrow(SIGN_OUT_FAILED_MESSAGE);

    expect((window as unknown as { __replaced?: string }).__replaced).toBeUndefined();
  });

  it.each([429, 500])('rejects without reloading after a logout HTTP %i', async (status) => {
    installFetch(() => Promise.resolve(new Response(null, { status })));
    await expect(logoutSession()).rejects.toThrow(SIGN_OUT_FAILED_MESSAGE);
    expect((window as unknown as { __replaced?: string }).__replaced).toBeUndefined();
  });
});
