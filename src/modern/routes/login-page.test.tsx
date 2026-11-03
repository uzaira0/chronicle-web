import { afterEach, describe, expect, test } from 'bun:test';
import { chromium } from '@playwright/test';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';

import { store } from '@/state/store';
import { LoginPage } from './login-page';

function stubFetch(value: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value,
    writable: true,
  });
}

const AUTHENTICATED_BODY = JSON.stringify({
  authenticated: true,
  authMode: 'cookie-bootstrap',
  csrfToken: 'server-csrf-token',
  expiresAt: 1_900_000_000_000,
  providerLabel: 'Chronicle dashboard',
  status: 'authenticated',
  tokenSource: 'dashboard-login',
  user: { email: 'admin@example.com', id: 'user-9', name: 'Admin', roles: ['admin'] },
});

function renderLogin() {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route element={<div>DASHBOARD</div>} path="/" />
          <Route element={<LoginPage redirectTo="/" />} path="/login" />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

function submitPassword(password: string) {
  const field = screen.getByLabelText(/dashboard password/i);
  fireEvent.change(field, { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('LoginPage', () => {
  afterEach(() => {
    delete (globalThis as Partial<typeof globalThis>).fetch;
  });

  test('renders a branded password form', () => {
    renderLogin();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in to the dashboard' })).toBeTruthy();
    expect(screen.getByText('Sign in to the dashboard')).toBeTruthy();
    const field = screen.getByLabelText(/dashboard password/i);
    expect(field.getAttribute('type')).toBe('password');
    expect(field.getAttribute('autocomplete')).toBe('current-password');
    expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
  });

  // The required marker is decoration, so a browser finds the field by its exact name.
  test('a real browser finds the password field by its exact accessible name', async () => {
    const view = renderLogin();
    const form = view.container.querySelector('form');
    if (!form) throw new Error('Login form was not rendered.');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.route('**/*', (route) => route.abort());
      await page.setContent(form.outerHTML);
      // The same accessible-name locator the deployed journey signs in with (selfhost-journey.spec.ts); a browser
      // exposes the password input as a textbox. Label-text matching (getByLabel) would also read the hidden mark.
      const field = page.getByRole('textbox', { name: 'Dashboard password', exact: true });
      expect(await field.count()).toBe(1);
      expect(await field.getAttribute('type')).toBe('password');
      await field.fill('dashboard-secret');
      expect(await field.inputValue()).toBe('dashboard-secret');
    } finally {
      await browser.close();
    }
  }, 20_000);

  test('offers the SSO affordance only when a login URL is supplied', () => {
    const { unmount } = render(
      <Provider store={store}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.queryByText(/continue with/i)).toBeNull();
    unmount();

    render(
      <Provider store={store}>
        <MemoryRouter>
          <LoginPage loginUrl="/chronicle/v3/auth/oidc/login" providerLabel="Institutional SSO" />
        </MemoryRouter>
      </Provider>,
    );
    const ssoLink = screen.getByRole('link', { name: /continue with institutional sso/i });
    expect(ssoLink.getAttribute('href')).toBe('/chronicle/v3/auth/oidc/login');
  });

  test('refuses to call the backend with an empty password', async () => {
    let calls = 0;
    stubFetch(() => {
      calls += 1;
      return Promise.resolve(new Response(AUTHENTICATED_BODY, { status: 200 }));
    });

    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Enter the dashboard password to continue.')).toBeTruthy();
    });
    expect(calls).toBe(0);
  });

  test('shows the rejection message and stays on the login page after a 401', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ authenticated: false, error: 'Incorrect dashboard password.' }), {
          status: 401,
        }),
      ),
    );

    renderLogin();
    submitPassword('wrong-password');

    // The translated rejection, never the untranslated server text.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('The server rejected that password. Check it and try again.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByText('Incorrect dashboard password.')).toBeNull();
    expect(screen.queryByText('DASHBOARD')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>(/dashboard password/i).value).toBe('wrong-password');
  });

  test('shows a distinct message after a 429', async () => {
    stubFetch(() => Promise.resolve(new Response('', { status: 429 })));

    renderLogin();
    submitPassword('wrong-password');

    await waitFor(() => {
      expect(screen.getByText('Too many sign-in attempts. Wait a minute before trying again.')).toBeTruthy();
    });
    expect(screen.queryByText('DASHBOARD')).toBeNull();
  });

  test('authenticates the session and navigates on success', async () => {
    stubFetch(() => Promise.resolve(new Response(AUTHENTICATED_BODY, { status: 200 })));

    renderLogin();
    submitPassword('correct-password');

    await waitFor(() => {
      expect(screen.getByText('DASHBOARD')).toBeTruthy();
    });
    expect(store.getState().session.status).toBe('authenticated');
    expect(store.getState().session.tokenSource).toBe('dashboard-login');
    expect(store.getState().session.user?.email).toBe('admin@example.com');
  });
});
