import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';

import { AppShell } from '@/app/app-shell';
import { AUTH_LOGOUT_ENDPOINT } from '@/lib/auth-endpoints';
import { SIGN_OUT_FAILED_MESSAGE } from '@/lib/auth-utils';
import { bootstrapSession, logoutSession, SESSION_STATUS } from '@/state/session-slice';
import { store } from '@/state/store';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe('mobile shell controls', () => {
  test('keeps header actions visible and moves language selection into reachable mobile navigation', async () => {
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppShell />
        </MemoryRouter>
      </Provider>,
    );

    const header = screen.getByRole('banner');
    expect(within(header).queryByRole('combobox', { name: 'Language' }) !== null).toBe(false);
    expect(within(header).getByRole('button', { name: 'Sign out' })).toBeTruthy();
    await waitFor(() => expect(within(header).getByRole('button', { name: 'Toggle theme' })).toBeTruthy());

    fireEvent.click(within(header).getByRole('button', { name: 'Open navigation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Navigation' });
    expect(within(dialog).getByRole('combobox', { name: 'Language' })).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Operations' })).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Studies' })).toBeTruthy();
  });
});

// On a shared lab machine the header's Sign out must really end the session: when the server confirms, the browser
// leaves the signed-in state; when it cannot, the dashboard locks and says sign-out failed instead of pretending.
describe('header sign out', () => {
  test.each([
    [204, SESSION_STATUS.idle, null],
    [503, SESSION_STATUS.locked, SIGN_OUT_FAILED_MESSAGE],
  ] as const)('a logout answered %i leaves the session %s', async (status, sessionStatus, errorMessage) => {
    const logouts: string[] = [];
    globalThis.fetch = routeFetch({
      [`POST ${AUTH_LOGOUT_ENDPOINT}`]: (request) => {
        logouts.push(request.method);
        return new Response(null, { status });
      },
    });
    const restoreRequest = installRelativeRequest();
    store.dispatch(
      bootstrapSession.fulfilled(
        {
          ...store.getState().session,
          status: SESSION_STATUS.authenticated,
          tokenSource: 'dashboard-login',
          user: { id: 'researcher', name: null, email: null, roles: [] },
        },
        'signed-in',
        undefined,
      ),
    );
    try {
      render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <AppShell />
          </MemoryRouter>
        </Provider>,
      );
      fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Sign out' }));
      await waitFor(() => expect(store.getState().session.status).toBe(sessionStatus));
      expect(logouts).toEqual(['POST']);
      expect(store.getState().session.errorMessage).toBe(errorMessage);
    } finally {
      restoreRequest();
      store.dispatch(logoutSession.fulfilled(undefined, 'reset', undefined));
    }
  });
});
