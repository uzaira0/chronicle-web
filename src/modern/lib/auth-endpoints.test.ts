import { describe, expect, it } from 'bun:test';

import {
  AUTH_COOKIE_ENDPOINT,
  AUTH_LOGIN_ENDPOINT,
  AUTH_LOGOUT_ENDPOINT,
  AUTH_SESSION_ENDPOINT,
  AUTH_TESTING_LOGIN_ENDPOINT,
} from './auth-endpoints';

// These constants pin the exact mobile-router paths. A string-literal mutation
// (e.g. emptying or altering the path) would route auth requests to the wrong
// backend context and break login/logout silently, so each must be asserted
// against its exact value.
describe('auth endpoint constants', () => {
  it('AUTH_COOKIE_ENDPOINT is the v3 set-cookie path', () => {
    expect(AUTH_COOKIE_ENDPOINT).toBe('/chronicle/v3/auth/set-cookie');
  });

  it('AUTH_LOGIN_ENDPOINT is the v3 oidc login path', () => {
    expect(AUTH_LOGIN_ENDPOINT).toBe('/chronicle/v3/auth/oidc/login');
  });

  it('AUTH_LOGOUT_ENDPOINT is the v3 logout path', () => {
    expect(AUTH_LOGOUT_ENDPOINT).toBe('/chronicle/v3/auth/logout');
  });

  it('AUTH_SESSION_ENDPOINT is the v3 session path', () => {
    expect(AUTH_SESSION_ENDPOINT).toBe('/chronicle/v3/auth/session');
  });

  it('AUTH_TESTING_LOGIN_ENDPOINT is the v3 testing-login path', () => {
    expect(AUTH_TESTING_LOGIN_ENDPOINT).toBe('/chronicle/v3/auth/testing-login');
  });

  it('all endpoints use the /chronicle/v3/auth prefix (web-router strip mismatch guard)', () => {
    for (const ep of [
      AUTH_COOKIE_ENDPOINT,
      AUTH_LOGIN_ENDPOINT,
      AUTH_LOGOUT_ENDPOINT,
      AUTH_SESSION_ENDPOINT,
      AUTH_TESTING_LOGIN_ENDPOINT,
    ]) {
      expect(ep.startsWith('/chronicle/v3/auth/')).toBe(true);
    }
  });

  it('endpoints are all distinct', () => {
    const all = [
      AUTH_COOKIE_ENDPOINT,
      AUTH_LOGIN_ENDPOINT,
      AUTH_LOGOUT_ENDPOINT,
      AUTH_SESSION_ENDPOINT,
      AUTH_TESTING_LOGIN_ENDPOINT,
    ];
    expect(new Set(all).size).toBe(all.length);
  });
});
