import { chronicleTest as test, expect } from '../fixtures/chronicle-test.js';

test.describe('Auth Flow', () => {
  test('testing-login returns a non-blank token for test_user1', async ({ providers, context }) => {
    const { authToken } = await providers.auth.authenticate(context, 'test_user1');
    expect(authToken).toBeTruthy();
    expect(authToken.length).toBeGreaterThan(10);
  });

  test('distinct users produce distinct tokens', async ({ providers, context }) => {
    const a = await providers.auth.authenticate(context, 'test_user1');
    const b = await providers.auth.authenticate(context, 'test_user2');
    expect(a.authToken).not.toEqual(b.authToken);
  });

  test('admin token is non-blank', async ({ providers, context }) => {
    const { authToken } = await providers.auth.authenticate(context, 'test_admin');
    expect(authToken).toBeTruthy();
  });
});
