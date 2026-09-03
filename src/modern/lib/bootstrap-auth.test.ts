import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { installBrowserEnv, uninstallBrowserEnv } from '../test/browser-env';

let importCtr = 0;
function nextId() {
  importCtr += 1;
  return importCtr;
}

async function messageFromRejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('Expected the request to reject, but it resolved.');
}

function stubFetch(value: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value,
    writable: true,
  });
}

describe('requestDashboardLogin()', () => {
  beforeEach(() => {
    installBrowserEnv({ cookie: 'ol_csrf_token=fallback-cookie' });
  });

  afterEach(() => {
    uninstallBrowserEnv();
    delete (globalThis as Partial<typeof globalThis>).fetch;
  });

  it('posts the password and returns an authenticated session', async () => {
    const calls: Array<{ init: RequestInit | undefined; input: RequestInfo | URL }> = [];
    stubFetch((input, init) => {
      calls.push({ init, input });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            authenticated: true,
            authMode: 'cookie-bootstrap',
            csrfToken: 'server-csrf-token',
            expiresAt: 1_900_000_000_000,
            providerLabel: 'Chronicle dashboard',
            status: 'authenticated',
            tokenSource: 'dashboard-login',
            user: { email: 'admin@example.com', id: 'user-9', name: 'Admin', roles: ['admin'] },
          }),
          { status: 200 },
        ),
      );
    });

    const { requestDashboardLogin } = (await import(
      `./bootstrap-auth.ts?dashboard=${nextId()}`
    )) as typeof import('./bootstrap-auth');
    const session = await requestDashboardLogin('hunter2');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe('/chronicle/v3/auth/dashboard-login');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.credentials).toBe('same-origin');
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ password: 'hunter2' }));
    expect(session.status).toBe('authenticated');
    expect(session.csrfToken).toBe('server-csrf-token');
    expect(session.tokenSource).toBe('dashboard-login');
    expect(session.user?.email).toBe('admin@example.com');
  });

  it('rejects with the server message on a 401', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ authenticated: false, error: 'Incorrect dashboard password.' }), {
          status: 401,
        }),
      ),
    );

    const { requestDashboardLogin } = (await import(
      `./bootstrap-auth.ts?dashboard=${nextId()}`
    )) as typeof import('./bootstrap-auth');

    expect(await messageFromRejection(requestDashboardLogin('nope'))).toBe('Incorrect dashboard password.');
  });

  it('rejects with a distinct rate-limit message on a 429', async () => {
    stubFetch(() => Promise.resolve(new Response('', { status: 429 })));

    const { DASHBOARD_LOGIN_RATE_LIMITED_MESSAGE, requestDashboardLogin } = (await import(
      `./bootstrap-auth.ts?dashboard=${nextId()}`
    )) as typeof import('./bootstrap-auth');

    expect(await messageFromRejection(requestDashboardLogin('nope'))).toBe(DASHBOARD_LOGIN_RATE_LIMITED_MESSAGE);
  });

  it('rejects when a 200 response is not authenticated', async () => {
    stubFetch(() => Promise.resolve(new Response(JSON.stringify({ authenticated: false }), { status: 200 })));

    const { DASHBOARD_LOGIN_REJECTED_MESSAGE, requestDashboardLogin } = (await import(
      `./bootstrap-auth.ts?dashboard=${nextId()}`
    )) as typeof import('./bootstrap-auth');

    expect(await messageFromRejection(requestDashboardLogin('nope'))).toBe(DASHBOARD_LOGIN_REJECTED_MESSAGE);
  });

  it('rejects with the unavailable message when the request itself fails', async () => {
    stubFetch(() => Promise.reject(new Error('network down')));

    const { DASHBOARD_LOGIN_UNAVAILABLE_MESSAGE, requestDashboardLogin } = (await import(
      `./bootstrap-auth.ts?dashboard=${nextId()}`
    )) as typeof import('./bootstrap-auth');

    expect(await messageFromRejection(requestDashboardLogin('nope'))).toBe(DASHBOARD_LOGIN_UNAVAILABLE_MESSAGE);
  });
});

describe('initializeBootstrapSession()', () => {
  beforeEach(() => {
    installBrowserEnv({
      cookie: 'ol_csrf_token=fallback-cookie',
    });
  });

  afterEach(() => {
    uninstallBrowserEnv();
    delete (globalThis as Partial<typeof globalThis>).fetch;
  });

  it('returns an awaiting-sso session when no authenticated server session exists', async () => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: () =>
        Promise.resolve(
          new Response(JSON.stringify({ authenticated: false, testingLoginEnabled: false }), {
            status: 200,
          }),
        ),
      writable: true,
    });

    const { initializeBootstrapSession } = (await import(
      `./bootstrap-auth.ts?sso=${nextId()}`
    )) as typeof import('./bootstrap-auth');
    const session = await initializeBootstrapSession();

    expect(session).toEqual({
      authMode: 'institutional-sso',
      csrfToken: 'fallback-cookie',
      expiresAt: null,
      loginUrl: null,
      providerLabel: 'Institutional SSO',
      status: 'awaiting-sso',
      testingLoginEnabled: false,
      tokenSource: 'sso-session',
      user: null,
    });
  });

  it('creates a testing-login session when the server advertises that bridge', async () => {
    const calls: Array<{ init: RequestInit | undefined; input: RequestInfo | URL }> = [];

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ init, input });

        if (typeof input === 'string' && input.endsWith('/session')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                authenticated: false,
                providerLabel: 'Institutional SSO',
                status: 'awaiting-sso',
                testingLoginEnabled: true,
                tokenSource: 'sso-session',
              }),
              { status: 200 },
            ),
          );
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              authenticated: true,
              authMode: 'cookie-bootstrap',
              csrfToken: 'server-csrf-token',
              expiresAt: 1_900_000_000_000,
              providerLabel: 'Chronicle testing session',
              status: 'authenticated',
              tokenSource: 'testing-login',
              user: {
                email: 'test@example.com',
                id: 'user-123',
                name: 'Ada Lovelace',
                roles: ['researcher'],
              },
            }),
            { status: 200 },
          ),
        );
      },
      writable: true,
    });

    const { initializeBootstrapSession } = (await import(
      `./bootstrap-auth.ts?bootstrap=${nextId()}`
    )) as typeof import('./bootstrap-auth');
    const session = await initializeBootstrapSession();

    expect(calls).toHaveLength(2);
    expect(calls[0]?.input).toBe('/chronicle/v3/auth/session');
    expect(calls[1]?.input).toBe('/chronicle/v3/auth/testing-login');
    expect(calls[1]?.init?.method).toBe('POST');
    expect(calls[1]?.init?.credentials).toBe('same-origin');
    expect(calls[1]?.init?.body).toBe(JSON.stringify({}));
    expect(session).toEqual({
      authMode: 'cookie-bootstrap',
      csrfToken: 'server-csrf-token',
      expiresAt: 1_900_000_000_000,
      loginUrl: null,
      providerLabel: 'Chronicle testing session',
      status: 'authenticated',
      testingLoginEnabled: true,
      tokenSource: 'testing-login',
      user: {
        email: 'test@example.com',
        id: 'user-123',
        name: 'Ada Lovelace',
        roles: ['researcher'],
      },
    });
  });
});
