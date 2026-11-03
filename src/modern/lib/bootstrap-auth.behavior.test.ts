import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { routeFetch } from '@/test/http-fixtures';
import { installBrowserEnv, uninstallBrowserEnv } from '../test/browser-env';
import { AUTH_SESSION_ENDPOINT } from './auth-endpoints';
// bootstrap-auth.ts holds no mutable cross-call state, so one static import serves every scenario
// (a query-suffixed re-import would also hide the module from coverage).
import * as auth from './bootstrap-auth';

function installSessionResponse(handler: () => Response, calls: Request[]) {
  globalThis.fetch = routeFetch({
    [`GET ${AUTH_SESSION_ENDPOINT}`]: (request) => {
      calls.push(request);
      return handler();
    },
  });
}

const SESSION_PATH = AUTH_SESSION_ENDPOINT;

describe('bootstrap-auth — fetchServerSession behavior (via initializeBootstrapSession)', () => {
  beforeEach(() => {
    installBrowserEnv({ cookie: 'ol_csrf_token=cookie-csrf' });
  });
  afterEach(() => {
    uninstallBrowserEnv();
    delete (globalThis as Partial<typeof globalThis>).fetch;
  });

  it('treats a 401 session as not-authenticated without trying the testing-login bridge', async () => {
    const calls: Request[] = [];
    installSessionResponse(() => new Response('unauthorized', { status: 401 }), calls);

    const { initializeBootstrapSession } = auth;
    const session = await initializeBootstrapSession();

    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([SESSION_PATH]);
    expect(session.status).toBe('awaiting-sso');
    expect(session.tokenSource).toBe('sso-session');
    expect(session.testingLoginEnabled).toBe(false);
  });

  it('throws when the session endpoint returns a non-401 error status', async () => {
    const calls: Request[] = [];
    installSessionResponse(() => new Response('boom', { status: 503 }), calls);
    const { initializeBootstrapSession } = auth;
    await expect(initializeBootstrapSession()).rejects.toThrow('Auth session request failed with status 503.');
  });

  it('treats a non-object session payload as empty → awaiting-sso, no testing-login attempt', async () => {
    const calls: Request[] = [];
    installSessionResponse(() => new Response(JSON.stringify('not-an-object'), { status: 200 }), calls);
    const { initializeBootstrapSession } = auth;
    const session = await initializeBootstrapSession();

    expect(calls).toHaveLength(1); // never reaches testing-login
    expect(session.status).toBe('awaiting-sso');
    expect(session.authMode).toBe('institutional-sso');
    expect(session.testingLoginEnabled).toBe(false);
  });

  it('treats a null session payload as empty → awaiting-sso', async () => {
    const calls: Request[] = [];
    installSessionResponse(() => new Response(JSON.stringify(null), { status: 200 }), calls);
    const { initializeBootstrapSession } = auth;
    const session = await initializeBootstrapSession();
    expect(session.status).toBe('awaiting-sso');
  });
});

describe('bootstrap-auth — idle expiry', () => {
  beforeEach(() => {
    installBrowserEnv({ cookie: 'chronicle_auth=idle-expired; ol_csrf_token=cookie-csrf' });
  });
  afterEach(() => {
    uninstallBrowserEnv();
    delete (globalThis as Partial<typeof globalThis>).fetch;
  });

  it('requires sign-in after refreshing an idle-expired session even when testing login is enabled', async () => {
    const calls: Request[] = [];
    installSessionResponse(() => Response.json({ authenticated: false, testingLoginEnabled: true }), calls);
    const { initializeBootstrapSession } = auth;
    const session = await initializeBootstrapSession();

    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([SESSION_PATH]);
    expect(session.status).toBe('awaiting-sso');
    expect(session.user).toBeNull();
  });

  it('sanitizes malformed session JSON with an actionable session message', async () => {
    installSessionResponse(() => new Response('private malformed response'), []);
    const { initializeBootstrapSession, AUTH_SESSION_NETWORK_FAILED_MESSAGE } = auth;
    await expect(initializeBootstrapSession()).rejects.toThrow(AUTH_SESSION_NETWORK_FAILED_MESSAGE);
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
    installSessionResponse(() => authSession({ user: { email: 'e', id: 'i', name: 'n', roles: [] } }), []);
    const { initializeBootstrapSession } = auth;
    const session = await initializeBootstrapSession();
    // URL-decoded cookie value.
    expect(session.csrfToken).toBe('value encoded');
  });

  it('uses the server csrfToken when present (server wins over cookie)', async () => {
    installBrowserEnv({ cookie: 'ol_csrf_token=cookie-val' });
    installSessionResponse(
      () => authSession({ csrfToken: 'server-val', user: { email: 'e', id: 'i', name: 'n', roles: [] } }),
      [],
    );
    const { initializeBootstrapSession } = auth;
    const session = await initializeBootstrapSession();
    expect(session.csrfToken).toBe('server-val');
  });

  it('yields a null csrfToken when neither server nor cookie provides one', async () => {
    installBrowserEnv({ cookie: 'unrelated=x' });
    installSessionResponse(() => authSession({ user: { email: 'e', id: 'i', name: 'n', roles: [] } }), []);
    const { initializeBootstrapSession } = auth;
    const session = await initializeBootstrapSession();
    expect(session.csrfToken).toBeNull();
  });

  it('does not match a cookie whose name is a prefix of ol_csrf_token', async () => {
    // `ol_csrf_token2` must not satisfy the `ol_csrf_token=` lookup.
    installBrowserEnv({ cookie: 'ol_csrf_token2=wrong' });
    installSessionResponse(() => authSession({ user: { email: 'e', id: 'i', name: 'n', roles: [] } }), []);
    const { initializeBootstrapSession } = auth;
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
    installSessionResponse(() => new Response(JSON.stringify({ authenticated: true, user }), { status: 200 }), []);
  }

  it('maps raw JWT identity fields without trusting deployment-specific role claims', async () => {
    authWithUser({
      email: 'jwt@example.com',
      family_name: 'Lovelace',
      given_name: 'Ada',
      'https://unrelated.example/metadata': { roles: ['admin', 'researcher'] },
      sub: 'sub-42',
    });
    const { initializeBootstrapSession } = auth;
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
    const { initializeBootstrapSession } = auth;
    const session = await initializeBootstrapSession();
    expect(session.user?.name).toBe('Augusta King');
  });

  it('joins only the present name parts (filter(Boolean) drops missing family_name)', async () => {
    authWithUser({ given_name: 'Solo', sub: 's' });
    const { initializeBootstrapSession } = auth;
    const session = await initializeBootstrapSession();
    expect(session.user?.name).toBe('Solo');
  });

  it('produces a null name when no name parts exist', async () => {
    authWithUser({ email: 'noname@x.com', sub: 's' });
    const { initializeBootstrapSession } = auth;
    const session = await initializeBootstrapSession();
    expect(session.user?.name).toBeNull();
    expect(session.user?.email).toBe('noname@x.com');
  });

  it('defaults email and id to null when the JWT omits them', async () => {
    authWithUser({ name: 'Anon' });
    const { initializeBootstrapSession } = auth;
    const session = await initializeBootstrapSession();
    expect(session.user?.email).toBeNull();
    expect(session.user?.id).toBeNull();
  });

  it('defaults roles to an empty array when metadata is absent', async () => {
    authWithUser({ name: 'Anon', sub: 's' });
    const { initializeBootstrapSession } = auth;
    const session = await initializeBootstrapSession();
    expect(session.user?.roles).toEqual([]);
  });

  it('passes through an already-shaped SessionUser unchanged', async () => {
    const ready = { email: 'r@x.com', id: 'rid', name: 'Ready', roles: ['x'] };
    authWithUser(ready);
    const { initializeBootstrapSession } = auth;
    const session = await initializeBootstrapSession();
    expect(session.user).toEqual(ready);
  });

  it('returns a null user when the authenticated response carries no user', async () => {
    installSessionResponse(() => new Response(JSON.stringify({ authenticated: true }), { status: 200 }), []);
    const { initializeBootstrapSession } = auth;
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
    installSessionResponse(
      () => new Response(JSON.stringify({ authenticated: true, testingLoginEnabled: false }), { status: 200 }),
      [],
    );
    const { initializeBootstrapSession } = auth;
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
    installSessionResponse(
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
    const { initializeBootstrapSession } = auth;
    const session = await initializeBootstrapSession();
    expect(session.authMode).toBe('institutional-sso');
    expect(session.providerLabel).toBe('Custom IdP');
    expect(session.expiresAt).toBe(1_888_000_000_000);
  });

  it('awaiting-sso session surfaces the server loginUrl, providerLabel and testingLoginEnabled', async () => {
    installSessionResponse(
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
    const { initializeBootstrapSession } = auth;
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
    installSessionResponse(() => new Response(JSON.stringify({ authenticated: false }), { status: 200 }), []);
    const { initializeBootstrapSession } = auth;
    const session = await initializeBootstrapSession();
    expect(session.providerLabel).toBe('Institutional SSO');
    expect(session.loginUrl).toBeNull();
    expect(session.testingLoginEnabled).toBe(false);
  });
});
