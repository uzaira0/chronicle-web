import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { RootState } from '@/state/store';
import { installBrowserEnv, uninstallBrowserEnv } from '../test/browser-env';
import { AUTH_LOGOUT_ENDPOINT } from './auth-endpoints';
import { logoutSession, selectIsAdmin, selectUserDisplayName } from './auth-utils';

// Builds a minimal RootState with only the session slice the selectors read.
function stateWithUser(user: unknown): RootState {
  return { session: { user } } as unknown as RootState;
}

describe('selectIsAdmin()', () => {
  it('returns true when roles includes "admin"', () => {
    expect(selectIsAdmin(stateWithUser({ roles: ['admin'] }))).toBe(true);
  });

  it('returns true when "admin" is among several roles', () => {
    expect(selectIsAdmin(stateWithUser({ roles: ['researcher', 'admin', 'auditor'] }))).toBe(true);
  });

  it('returns false when roles does not include "admin"', () => {
    expect(selectIsAdmin(stateWithUser({ roles: ['researcher'] }))).toBe(false);
  });

  it('returns false for the empty roles array', () => {
    expect(selectIsAdmin(stateWithUser({ roles: [] }))).toBe(false);
  });

  it('returns false when roles is missing (undefined)', () => {
    expect(selectIsAdmin(stateWithUser({}))).toBe(false);
  });

  it('returns false when there is no user', () => {
    expect(selectIsAdmin(stateWithUser(null))).toBe(false);
    expect(selectIsAdmin(stateWithUser(undefined))).toBe(false);
  });

  it('returns false when roles is not an array (Array.isArray guard)', () => {
    // A non-array `roles` (e.g. a string that happens to contain "admin")
    // must NOT be treated as admin — the Array.isArray guard is load-bearing.
    expect(selectIsAdmin(stateWithUser({ roles: 'admin' }))).toBe(false);
    expect(selectIsAdmin(stateWithUser({ roles: { admin: true } }))).toBe(false);
  });

  it('is case-sensitive: "Admin" / "ADMIN" are not "admin"', () => {
    expect(selectIsAdmin(stateWithUser({ roles: ['Admin'] }))).toBe(false);
    expect(selectIsAdmin(stateWithUser({ roles: ['ADMIN'] }))).toBe(false);
    expect(selectIsAdmin(stateWithUser({ roles: ['administrator'] }))).toBe(false);
  });
});

describe('selectUserDisplayName()', () => {
  it('returns null when there is no user', () => {
    expect(selectUserDisplayName(stateWithUser(null))).toBeNull();
    expect(selectUserDisplayName(stateWithUser(undefined))).toBeNull();
  });

  it('prefers name over email when both are present', () => {
    expect(selectUserDisplayName(stateWithUser({ email: 'e@x.com', name: 'Ada' }))).toBe('Ada');
  });

  it('falls back to email when name is missing', () => {
    expect(selectUserDisplayName(stateWithUser({ email: 'e@x.com', name: undefined }))).toBe('e@x.com');
  });

  it('falls back to email when name is null', () => {
    expect(selectUserDisplayName(stateWithUser({ email: 'e@x.com', name: null }))).toBe('e@x.com');
  });

  it('returns null when both name and email are absent', () => {
    expect(selectUserDisplayName(stateWithUser({}))).toBeNull();
  });

  it('returns null when both name and email are null', () => {
    expect(selectUserDisplayName(stateWithUser({ email: null, name: null }))).toBeNull();
  });

  it('does NOT fall through to email when name is the empty string (?? only catches null/undefined)', () => {
    // `??` is nullish: an empty-string name is a real value and must be returned as-is.
    expect(selectUserDisplayName(stateWithUser({ email: 'e@x.com', name: '' }))).toBe('');
  });
});

describe('logoutSession()', () => {
  type FetchCall = { init: RequestInit | undefined; input: RequestInfo | URL };
  let fetchCalls: FetchCall[];

  function installFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: (input: RequestInfo | URL, init?: RequestInit) => {
        fetchCalls.push({ init, input });
        return impl(input, init);
      },
      writable: true,
    });
  }

  beforeEach(() => {
    fetchCalls = [];
    installBrowserEnv({ url: 'https://chronicle.test/studies/abc' });
    // Seed the legacy localStorage artifacts that logout must purge.
    localStorage.setItem('chronicle_user_info', 'a');
    localStorage.setItem('auth0_user_info', 'b');
    localStorage.setItem('auth0_id_token', 'c');
    localStorage.setItem('keep_me', 'untouched');
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

  it('clears exactly the three legacy localStorage keys and leaves others intact', async () => {
    installFetch(() => Promise.resolve(new Response(null, { status: 200 })));
    await logoutSession();

    expect(localStorage.getItem('chronicle_user_info')).toBeNull();
    expect(localStorage.getItem('auth0_user_info')).toBeNull();
    expect(localStorage.getItem('auth0_id_token')).toBeNull();
    expect(localStorage.getItem('keep_me')).toBe('untouched');
  });

  it('reloads to the origin root', async () => {
    installFetch(() => Promise.resolve(new Response(null, { status: 200 })));
    await logoutSession();

    expect((window as unknown as { __replaced: string }).__replaced).toBe('https://chronicle.test/');
  });

  it('still purges storage and reloads even when the logout fetch rejects', async () => {
    installFetch(() => Promise.reject(new Error('network down')));

    await expect(logoutSession()).resolves.toBeUndefined();

    // Best-effort fetch failed but the cleanup path must still run.
    expect(localStorage.getItem('chronicle_user_info')).toBeNull();
    expect(localStorage.getItem('auth0_user_info')).toBeNull();
    expect(localStorage.getItem('auth0_id_token')).toBeNull();
    expect((window as unknown as { __replaced: string }).__replaced).toBe('https://chronicle.test/');
  });
});
