import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { logoutSession } from '@/state/session-slice';
import { store } from '@/state/store';
import { SessionBootstrap } from './session-bootstrap';

const originalFetch = globalThis.fetch;

afterEach(() => {
  // Unmount first: a mounted SessionBootstrap re-bootstraps when the reset below makes the session idle.
  cleanup();
  globalThis.fetch = originalFetch;
  mock.restore();
  store.dispatch(logoutSession.fulfilled(undefined, 'w20-reset', undefined));
});

describe('SessionBootstrap transport failure', () => {
  test('renders safe retryable state after rejected bootstrap fetch', async () => {
    let calls = 0;
    globalThis.fetch = mock(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new TypeError('W20_BOOTSTRAP_NETWORK_SENTINEL'))
        : Promise.resolve(new Response('unauthorized', { status: 401 }));
    }) as unknown as typeof fetch;

    render(
      <MemoryRouter>
        <Provider store={store}>
          <SessionBootstrap>
            <p>app</p>
          </SessionBootstrap>
        </Provider>
      </MemoryRouter>,
    );

    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(
      screen.getByText('Unable to reach the Chronicle session service. Check your connection and try again.'),
    ).toBeDefined();
    expect(screen.queryByText('W20_BOOTSTRAP_NETWORK_SENTINEL')).toBeNull();
    fireEvent.click(retry);
    await waitFor(() => expect(store.getState().session.status).toBe('awaiting-sso'));
    expect(calls).toBe(2);
  });
});
