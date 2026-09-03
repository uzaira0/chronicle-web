import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { installBrowserEnv, uninstallBrowserEnv } from '../test/browser-env';

// bootstrap-auth.ts holds module-level constants but no mutable cross-call
// state, yet the existing happy-path suite re-imports per test via a query
// suffix to be safe. We do the same here so each scenario starts clean.
let importCtr = 1000;
function nextId() {
  importCtr += 1;
  return importCtr;
}

type FetchCall = { init: RequestInit | undefined; input: RequestInfo | URL };

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function installRouter(handler: (path: string, init?: RequestInit) => Response, calls: FetchCall[]) {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ init, input });
      return Promise.resolve(handler(requestUrl(input), init));
    },
    writable: true,
  });
}

async function load(): Promise<typeof import('./bootstrap-auth')> {
  return (await import(`./bootstrap-auth.ts?b=${nextId()}`)) as typeof import('./bootstrap-auth');
}

const SESSION_PATH = '/chronicle/v3/auth/session';

describe('bootstrap-auth — fetchServerSession behavior (via initializeBootstrapSession)', () => {
  beforeEach(() => {
    installBrowserEnv({ cookie: 'ol_csrf_token=cookie-csrf' });
  });
  afterEach(() => {
    uninstallBrowserEnv();
    delete (globalThis as Partial<typeof globalThis>).fetch;
  });

  it('treats a 401 session as not-authenticated without trying the testing-login bridge', async () => {
    const calls: FetchCall[] = [];
    installRouter((path) => {
      if (path.endsWith('/session')) return new Response('unauthorized', { status: 401 });
      throw new Error(`unexpected request to ${path}`);
    }, calls);

    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();

    expect(calls.map((c) => requestUrl(c.input))).toEqual([SESSION_PATH]);
    expect(session.status).toBe('awaiting-sso');
    expect(session.tokenSource).toBe('sso-session');
    expect(session.testingLoginEnabled).toBe(false);
  });

  it('throws when the session endpoint returns a non-401 error status', async () => {
    const calls: FetchCall[] = [];
    installRouter(() => new Response('boom', { status: 503 }), calls);
    const { initializeBootstrapSession } = await load();
    await expect(initializeBootstrapSession()).rejects.toThrow('Auth session request failed with status 503.');
  });

  it('treats a non-object session payload as empty → awaiting-sso, no testing-login attempt', async () => {
    const calls: FetchCall[] = [];
    installRouter(() => new Response(JSON.stringify('not-an-object'), { status: 200 }), calls);
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();

    expect(calls).toHaveLength(1); // never reaches testing-login
    expect(session.status).toBe('awaiting-sso');
    expect(session.authMode).toBe('institutional-sso');
    expect(session.testingLoginEnabled).toBe(false);
  });

  it('treats a null session payload as empty → awaiting-sso', async () => {
    const calls: FetchCall[] = [];
    installRouter(() => new Response(JSON.stringify(null), { status: 200 }), calls);
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.status).toBe('awaiting-sso');
  });
});

describe('bootstrap-auth — requestTestingLogin behavior', () => {
  beforeEach(() => {
    installBrowserEnv({ cookie: 'ol_csrf_token=cookie-csrf' });
  });
  afterEach(() => {
    uninstallBrowserEnv();
    delete (globalThis as Partial<typeof globalThis>).fetch;
  });

  function sessionAdvertisingTesting(): Response {
    return new Response(JSON.stringify({ authenticated: false, testingLoginEnabled: true }), { status: 200 });
  }

  it('sends the testing-login POST with JSON content-type, empty-object body and same-origin creds', async () => {
    const calls: FetchCall[] = [];
    installRouter((path) => {
      if (path.endsWith('/session')) return sessionAdvertisingTesting();
      return new Response(
        JSON.stringify({ authenticated: true, user: { email: null, id: null, name: null, roles: [] } }),
        { status: 200 },
      );
    }, calls);

    const { initializeBootstrapSession } = await load();
    await initializeBootstrapSession();

    const loginCall = calls[1];
    expect(loginCall?.init?.method).toBe('POST');
    expect(loginCall?.init?.credentials).toBe('same-origin');
    expect(loginCall?.init?.body).toBe(JSON.stringify({}));
    expect((loginCall?.init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('falls back to awaiting-sso when testing-login is forbidden (403 → null)', async () => {
    const calls: FetchCall[] = [];
    installRouter((path) => {
      if (path.endsWith('/session')) return sessionAdvertisingTesting();
      return new Response('forbidden', { status: 403 });
    }, calls);

    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(calls).toHaveLength(2);
    expect(session.status).toBe('awaiting-sso');
  });

  it('falls back to awaiting-sso when testing-login errors (500 → null)', async () => {
    const calls: FetchCall[] = [];
    installRouter((path) => {
      if (path.endsWith('/session')) return sessionAdvertisingTesting();
      return new Response('server error', { status: 500 });
    }, calls);

    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.status).toBe('awaiting-sso');
  });

  it('throws when testing-login returns an unexpected error status (e.g. 502)', async () => {
    const calls: FetchCall[] = [];
    installRouter((path) => {
      if (path.endsWith('/session')) return sessionAdvertisingTesting();
      return new Response('bad gateway', { status: 502 });
    }, calls);

    const { initializeBootstrapSession } = await load();
    await expect(initializeBootstrapSession()).rejects.toThrow('Testing login request failed with status 502.');
  });

  it('falls back to awaiting-sso when testing-login returns a non-object body', async () => {
    const calls: FetchCall[] = [];
    installRouter((path) => {
      if (path.endsWith('/session')) return sessionAdvertisingTesting();
      return new Response(JSON.stringify(42), { status: 200 });
    }, calls);

    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.status).toBe('awaiting-sso');
  });

  it('falls back to awaiting-sso when testing-login responds 200 but authenticated is false', async () => {
    const calls: FetchCall[] = [];
    installRouter((path) => {
      if (path.endsWith('/session')) return sessionAdvertisingTesting();
      return new Response(JSON.stringify({ authenticated: false }), { status: 200 });
    }, calls);

    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.status).toBe('awaiting-sso');
  });
});

describe('bootstrap-auth — getCookie via CSRF fallback', () => {
  afterEach(() => {
    uninstallBrowserEnv();
    delete (globalThis as Partial<typeof globalThis>).fetch;
  });

  function authSession(extra: Record<string, unknown> = {}) {
    return new Response(JSON.stringify({ authenticated: true, ...extra }), { status: 200 });
  }

  it('falls back to the ol_csrf_token cookie when the server omits csrfToken', async () => {
    installBrowserEnv({ cookie: 'other=1; ol_csrf_token=value%20encoded; trailing=2' });
    installRouter(() => authSession({ user: { email: 'e', id: 'i', name: 'n', roles: [] } }), []);
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    // URL-decoded cookie value.
    expect(session.csrfToken).toBe('value encoded');
  });

  it('uses the server csrfToken when present (server wins over cookie)', async () => {
    installBrowserEnv({ cookie: 'ol_csrf_token=cookie-val' });
    installRouter(
      () => authSession({ csrfToken: 'server-val', user: { email: 'e', id: 'i', name: 'n', roles: [] } }),
      [],
    );
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.csrfToken).toBe('server-val');
  });

  it('yields a null csrfToken when neither server nor cookie provides one', async () => {
    installBrowserEnv({ cookie: 'unrelated=x' });
    installRouter(() => authSession({ user: { email: 'e', id: 'i', name: 'n', roles: [] } }), []);
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.csrfToken).toBeNull();
  });

  it('does not match a cookie whose name is a prefix of ol_csrf_token', async () => {
    // `ol_csrf_token2` must not satisfy the `ol_csrf_token=` lookup.
    installBrowserEnv({ cookie: 'ol_csrf_token2=wrong' });
    installRouter(() => authSession({ user: { email: 'e', id: 'i', name: 'n', roles: [] } }), []);
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.csrfToken).toBeNull();
  });
});

describe('bootstrap-auth — toSessionUser JWT mapping', () => {
  beforeEach(() => installBrowserEnv({ cookie: 'ol_csrf_token=c' }));
  afterEach(() => {
    uninstallBrowserEnv();
    delete (globalThis as Partial<typeof globalThis>).fetch;
  });

  function authWithUser(user: unknown) {
    installRouter(() => new Response(JSON.stringify({ authenticated: true, user }), { status: 200 }), []);
  }

  it('maps raw JWT identity fields without trusting deployment-specific role claims', async () => {
    authWithUser({
      email: 'jwt@example.com',
      family_name: 'Lovelace',
      given_name: 'Ada',
      'https://unrelated.example/metadata': { roles: ['admin', 'researcher'] },
      sub: 'sub-42',
    });
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.user).toEqual({
      email: 'jwt@example.com',
      id: 'sub-42',
      name: 'Ada Lovelace',
      roles: [],
    });
  });

  it('prefers an explicit name over the given/family join', async () => {
    authWithUser({ given_name: 'Ada', name: 'Augusta King', sub: 's' });
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.user?.name).toBe('Augusta King');
  });

  it('joins only the present name parts (filter(Boolean) drops missing family_name)', async () => {
    authWithUser({ given_name: 'Solo', sub: 's' });
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.user?.name).toBe('Solo');
  });

  it('produces a null name when no name parts exist', async () => {
    authWithUser({ email: 'noname@x.com', sub: 's' });
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.user?.name).toBeNull();
    expect(session.user?.email).toBe('noname@x.com');
  });

  it('defaults email and id to null when the JWT omits them', async () => {
    authWithUser({ name: 'Anon' });
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.user?.email).toBeNull();
    expect(session.user?.id).toBeNull();
  });

  it('defaults roles to an empty array when metadata is absent', async () => {
    authWithUser({ name: 'Anon', sub: 's' });
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.user?.roles).toEqual([]);
  });

  it('passes through an already-shaped SessionUser unchanged', async () => {
    const ready = { email: 'r@x.com', id: 'rid', name: 'Ready', roles: ['x'] };
    authWithUser(ready);
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.user).toEqual(ready);
  });

  it('returns a null user when the authenticated response carries no user', async () => {
    installRouter(() => new Response(JSON.stringify({ authenticated: true }), { status: 200 }), []);
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.user).toBeNull();
  });
});

describe('bootstrap-auth — authenticated/awaiting field fallbacks', () => {
  beforeEach(() => installBrowserEnv({ cookie: 'ol_csrf_token=c' }));
  afterEach(() => {
    uninstallBrowserEnv();
    delete (globalThis as Partial<typeof globalThis>).fetch;
  });

  it('applies cookie-bootstrap defaults for an authenticated SSO session with minimal fields', async () => {
    installRouter(
      () => new Response(JSON.stringify({ authenticated: true, testingLoginEnabled: false }), { status: 200 }),
      [],
    );
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();

    expect(session.authMode).toBe('cookie-bootstrap');
    expect(session.status).toBe('authenticated');
    expect(session.tokenSource).toBe('sso-session');
    expect(session.providerLabel).toBe('Institutional SSO');
    expect(session.loginUrl).toBeNull();
    expect(session.expiresAt).toBeNull();
    expect(session.testingLoginEnabled).toBe(false);
  });

  it('honors server-supplied authMode/status/tokenSource/providerLabel/expiresAt on an authenticated session', async () => {
    installRouter(
      () =>
        new Response(
          JSON.stringify({
            authMode: 'institutional-sso',
            authenticated: true,
            expiresAt: 1_888_000_000_000,
            providerLabel: 'Custom IdP',
            status: 'authenticated',
            tokenSource: 'sso-session',
          }),
          { status: 200 },
        ),
      [],
    );
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.authMode).toBe('institutional-sso');
    expect(session.providerLabel).toBe('Custom IdP');
    expect(session.expiresAt).toBe(1_888_000_000_000);
  });

  it('awaiting-sso session surfaces the server loginUrl, providerLabel and testingLoginEnabled', async () => {
    installRouter(
      () =>
        new Response(
          JSON.stringify({
            authenticated: false,
            loginUrl: 'https://idp.example/login',
            providerLabel: 'BCM SSO',
            testingLoginEnabled: false,
          }),
          { status: 200 },
        ),
      [],
    );
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.authMode).toBe('institutional-sso');
    expect(session.status).toBe('awaiting-sso');
    expect(session.loginUrl).toBe('https://idp.example/login');
    expect(session.providerLabel).toBe('BCM SSO');
    expect(session.tokenSource).toBe('sso-session');
    expect(session.expiresAt).toBeNull();
    expect(session.user).toBeNull();
  });

  it('awaiting-sso defaults providerLabel to Institutional SSO and loginUrl/testingLoginEnabled to null/false', async () => {
    installRouter(() => new Response(JSON.stringify({ authenticated: false }), { status: 200 }), []);
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.providerLabel).toBe('Institutional SSO');
    expect(session.loginUrl).toBeNull();
    expect(session.testingLoginEnabled).toBe(false);
  });

  it('testing-login session is labeled "Chronicle testing session" with tokenSource testing-login', async () => {
    installRouter((path) => {
      if (path.endsWith('/session')) {
        return new Response(JSON.stringify({ authenticated: false, testingLoginEnabled: true }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ authenticated: true, user: { email: 'e', id: 'i', name: 'n', roles: [] } }),
        { status: 200 },
      );
    }, []);
    const { initializeBootstrapSession } = await load();
    const session = await initializeBootstrapSession();
    expect(session.providerLabel).toBe('Chronicle testing session');
    expect(session.tokenSource).toBe('testing-login');
    expect(session.testingLoginEnabled).toBe(true);
  });
});
