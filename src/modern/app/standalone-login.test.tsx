import { afterEach, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { logoutSession } from '@/state/session-slice';
import { store } from '@/state/store';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { StandaloneLoginPage } from './session-bootstrap';

const originalFetch = globalThis.fetch;
let restoreRequest: (() => void) | undefined;
afterEach(() => {
  cleanup();
  store.dispatch(logoutSession.fulfilled(undefined, 'reset', undefined));
  globalThis.fetch = originalFetch;
  restoreRequest?.();
});

test('the standalone sign-in page offers the institutional sign-in the server advertises', async () => {
  restoreRequest = installRelativeRequest();
  globalThis.fetch = routeFetch({
    'GET /chronicle/v3/auth/session': () =>
      Response.json({ authenticated: false, loginUrl: '/chronicle/v3/auth/oidc/login', providerLabel: 'Campus SSO' }),
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route element={<StandaloneLoginPage />} path="/login" />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  const sso = await screen.findByRole('link', { name: /Campus SSO/ });
  expect(sso.getAttribute('href')).toBe('/chronicle/v3/auth/oidc/login');
});
