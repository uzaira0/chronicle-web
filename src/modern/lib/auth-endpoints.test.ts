import { expect, test } from 'bun:test';
import { AUTH_DASHBOARD_LOGIN_ENDPOINT, AUTH_LOGOUT_ENDPOINT, AUTH_SESSION_ENDPOINT } from './auth-endpoints';

test('dashboard auth endpoints keep the mobile router prefix and distinct paths', () => {
  const endpoints = [AUTH_DASHBOARD_LOGIN_ENDPOINT, AUTH_LOGOUT_ENDPOINT, AUTH_SESSION_ENDPOINT];
  expect(endpoints).toEqual([
    '/chronicle/v3/auth/dashboard-login',
    '/chronicle/v3/auth/logout',
    '/chronicle/v3/auth/session',
  ]);
  expect(new Set(endpoints).size).toBe(endpoints.length);
});
