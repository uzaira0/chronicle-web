import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import { bootstrapSession } from '@/state/session-slice';
import { store } from '@/state/store';
import { SessionBootstrap } from './session-bootstrap';

const originalFetch = globalThis.fetch;

// legal X1 (WCAG 2.2 AA): the bootstrapping and error panels are whole pages, so they
// need a main landmark or axe's landmark rules fail on every route before sign-in.
describe('SessionBootstrap landmarks', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test('bootstrapping and error states render inside a main landmark', () => {
    globalThis.fetch = mock(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
    render(
      <Provider store={store}>
        <SessionBootstrap>
          <p>app</p>
        </SessionBootstrap>
      </Provider>,
    );
    expect(screen.getByRole('main')).toBeTruthy();

    act(() => {
      store.dispatch(bootstrapSession.rejected(new Error('502'), 'req', undefined, 'boom'));
    });
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
