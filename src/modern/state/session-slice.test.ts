import { describe, expect, it } from 'bun:test';

import { bootstrapSession, loginWithPassword, sessionReducer } from './session-slice';

const INIT_ACTION = { type: '@@INIT' } as const;

function initialState() {
  return sessionReducer(undefined, INIT_ACTION);
}

function pendingAction(requestId = 'req-1') {
  return { type: bootstrapSession.pending.type, meta: { requestId, arg: undefined } };
}

function fulfilledAction(payload: Record<string, unknown>, requestId = 'req-1') {
  return { type: bootstrapSession.fulfilled.type, payload, meta: { requestId, arg: undefined } };
}

function rejectedAction(payload?: string, requestId = 'req-1') {
  return {
    type: bootstrapSession.rejected.type,
    payload,
    error: { message: 'Rejected' },
    meta: { requestId, arg: undefined, rejectedWithValue: payload !== undefined },
  };
}

const authenticatedPayload = {
  authMode: 'cookie-bootstrap' as const,
  csrfToken: 'csrf-abc',
  expiresAt: 1700000000,
  loginUrl: null,
  providerLabel: 'Chronicle testing session',
  status: 'authenticated' as const,
  tokenSource: 'testing-login' as const,
  user: {
    email: 'test@example.com',
    id: 'user-1',
    name: 'Test User',
    roles: ['admin'],
  },
};

const awaitingSsoPayload = {
  authMode: 'institutional-sso' as const,
  csrfToken: null,
  expiresAt: null,
  loginUrl: '/chronicle/v3/auth/oidc/login',
  providerLabel: 'Institutional SSO',
  status: 'awaiting-sso' as const,
  tokenSource: 'sso-session' as const,
  user: null,
};

// ─── Initial state ───────────────────────────────────────────────────────────

describe('sessionReducer — initial state', () => {
  it('returns an object', () => {
    expect(typeof initialState()).toBe('object');
  });

  it('has authMode set to institutional-sso', () => {
    expect(initialState().authMode).toBe('institutional-sso');
  });

  it('has backendCompatibility set to operational', () => {
    expect(initialState().backendCompatibility).toBe('operational');
  });

  it('has csrfToken set to null', () => {
    expect(initialState().csrfToken).toBeNull();
  });

  it('has errorMessage set to null', () => {
    expect(initialState().errorMessage).toBeNull();
  });

  it('has expiresAt set to null', () => {
    expect(initialState().expiresAt).toBeNull();
  });

  it('has hasAppShell set to true', () => {
    expect(initialState().hasAppShell).toBe(true);
  });

  it('has providerLabel set to Institutional SSO', () => {
    expect(initialState().providerLabel).toBe('Institutional SSO');
  });

  it('has status set to idle', () => {
    expect(initialState().status).toBe('idle');
  });

  it('has tokenSource set to null', () => {
    expect(initialState().tokenSource).toBeNull();
  });

  it('has user set to null', () => {
    expect(initialState().user).toBeNull();
  });

  it('matches the full initial state snapshot', () => {
    expect(initialState()).toEqual({
      authMode: 'institutional-sso',
      backendCompatibility: 'operational',
      csrfToken: null,
      errorMessage: null,
      expiresAt: null,
      hasAppShell: true,
      loginUrl: null,
      providerLabel: 'Institutional SSO',
      status: 'idle',
      testingLoginEnabled: false,
      tokenSource: null,
      user: null,
    });
  });
});

// ─── Pending action ──────────────────────────────────────────────────────────

describe('sessionReducer — pending action', () => {
  it('sets status to bootstrapping', () => {
    const state = sessionReducer(initialState(), pendingAction());
    expect(state.status).toBe('bootstrapping');
  });

  it('clears errorMessage', () => {
    const state = sessionReducer(initialState(), pendingAction());
    expect(state.errorMessage).toBeNull();
  });

  it('clears a previous error message', () => {
    const errorState = sessionReducer(initialState(), rejectedAction('previous error'));
    expect(errorState.errorMessage).toBe('previous error');
    const pending = sessionReducer(errorState, pendingAction());
    expect(pending.errorMessage).toBeNull();
  });

  it('preserves authMode', () => {
    const state = sessionReducer(initialState(), pendingAction());
    expect(state.authMode).toBe('institutional-sso');
  });

  it('preserves backendCompatibility', () => {
    const state = sessionReducer(initialState(), pendingAction());
    expect(state.backendCompatibility).toBe('operational');
  });

  it('preserves csrfToken', () => {
    const state = sessionReducer(initialState(), pendingAction());
    expect(state.csrfToken).toBeNull();
  });

  it('preserves expiresAt', () => {
    const state = sessionReducer(initialState(), pendingAction());
    expect(state.expiresAt).toBeNull();
  });

  it('preserves hasAppShell', () => {
    const state = sessionReducer(initialState(), pendingAction());
    expect(state.hasAppShell).toBe(true);
  });

  it('preserves providerLabel', () => {
    const state = sessionReducer(initialState(), pendingAction());
    expect(state.providerLabel).toBe('Institutional SSO');
  });

  it('preserves tokenSource', () => {
    const state = sessionReducer(initialState(), pendingAction());
    expect(state.tokenSource).toBeNull();
  });

  it('preserves user', () => {
    const state = sessionReducer(initialState(), pendingAction());
    expect(state.user).toBeNull();
  });
});

// ─── Fulfilled action ────────────────────────────────────────────────────────

describe('sessionReducer — fulfilled action', () => {
  it('sets authMode from payload', () => {
    const state = sessionReducer(initialState(), fulfilledAction(authenticatedPayload));
    expect(state.authMode).toBe('cookie-bootstrap');
  });

  it('sets csrfToken from payload', () => {
    const state = sessionReducer(initialState(), fulfilledAction(authenticatedPayload));
    expect(state.csrfToken).toBe('csrf-abc');
  });

  it('sets expiresAt from payload', () => {
    const state = sessionReducer(initialState(), fulfilledAction(authenticatedPayload));
    expect(state.expiresAt).toBe(1700000000);
  });

  it('sets providerLabel from payload', () => {
    const state = sessionReducer(initialState(), fulfilledAction(authenticatedPayload));
    expect(state.providerLabel).toBe('Chronicle testing session');
  });

  it('sets status from payload', () => {
    const state = sessionReducer(initialState(), fulfilledAction(authenticatedPayload));
    expect(state.status).toBe('authenticated');
  });

  it('sets tokenSource from payload', () => {
    const state = sessionReducer(initialState(), fulfilledAction(authenticatedPayload));
    expect(state.tokenSource).toBe('testing-login');
  });

  it('sets user from payload', () => {
    const state = sessionReducer(initialState(), fulfilledAction(authenticatedPayload));
    expect(state.user).toEqual({
      email: 'test@example.com',
      id: 'user-1',
      name: 'Test User',
      roles: ['admin'],
    });
  });

  it('clears errorMessage on success', () => {
    const errorState = sessionReducer(initialState(), rejectedAction('some error'));
    const state = sessionReducer(errorState, fulfilledAction(authenticatedPayload));
    expect(state.errorMessage).toBeNull();
  });

  it('sets user to null when payload user is null', () => {
    const state = sessionReducer(initialState(), fulfilledAction(awaitingSsoPayload));
    expect(state.user).toBeNull();
  });

  it('handles awaiting-sso status', () => {
    const state = sessionReducer(initialState(), fulfilledAction(awaitingSsoPayload));
    expect(state.status).toBe('awaiting-sso');
  });

  it('sets csrfToken to null when payload csrfToken is null', () => {
    const state = sessionReducer(initialState(), fulfilledAction(awaitingSsoPayload));
    expect(state.csrfToken).toBeNull();
  });

  it('sets expiresAt to null when payload expiresAt is null', () => {
    const state = sessionReducer(initialState(), fulfilledAction(awaitingSsoPayload));
    expect(state.expiresAt).toBeNull();
  });

  it('preserves backendCompatibility (not in payload)', () => {
    const state = sessionReducer(initialState(), fulfilledAction(authenticatedPayload));
    expect(state.backendCompatibility).toBe('operational');
  });

  it('preserves hasAppShell (not in payload)', () => {
    const state = sessionReducer(initialState(), fulfilledAction(authenticatedPayload));
    expect(state.hasAppShell).toBe(true);
  });

  it('sets user email correctly', () => {
    const state = sessionReducer(initialState(), fulfilledAction(authenticatedPayload));
    expect(state.user?.email).toBe('test@example.com');
  });

  it('sets user id correctly', () => {
    const state = sessionReducer(initialState(), fulfilledAction(authenticatedPayload));
    expect(state.user?.id).toBe('user-1');
  });

  it('sets user name correctly', () => {
    const state = sessionReducer(initialState(), fulfilledAction(authenticatedPayload));
    expect(state.user?.name).toBe('Test User');
  });

  it('sets user roles correctly', () => {
    const state = sessionReducer(initialState(), fulfilledAction(authenticatedPayload));
    expect(state.user?.roles).toEqual(['admin']);
  });
});

// ─── Rejected action ─────────────────────────────────────────────────────────

describe('sessionReducer — rejected action', () => {
  it('sets status to error', () => {
    const state = sessionReducer(initialState(), rejectedAction('fail'));
    expect(state.status).toBe('error');
  });

  it('uses payload as errorMessage when provided', () => {
    const state = sessionReducer(initialState(), rejectedAction('Bootstrap failed'));
    expect(state.errorMessage).toBe('Bootstrap failed');
  });

  it('uses default message when payload is undefined', () => {
    const state = sessionReducer(initialState(), rejectedAction(undefined));
    expect(state.errorMessage).toBe('Unable to initialize the Chronicle session.');
  });

  it('preserves other state fields on rejection', () => {
    const state = sessionReducer(initialState(), rejectedAction('error'));
    expect(state.authMode).toBe('institutional-sso');
    expect(state.csrfToken).toBeNull();
    expect(state.user).toBeNull();
  });
});

// ─── Dashboard password login ────────────────────────────────────────────────

describe('sessionReducer — loginWithPassword', () => {
  const dashboardPayload = {
    ...authenticatedPayload,
    providerLabel: 'Chronicle dashboard',
    tokenSource: 'dashboard-login' as const,
  };

  function loginPending(requestId = 'login-1') {
    return { type: loginWithPassword.pending.type, meta: { requestId, arg: 'pw' } };
  }

  function loginFulfilled(payload: Record<string, unknown>, requestId = 'login-1') {
    return { type: loginWithPassword.fulfilled.type, payload, meta: { requestId, arg: 'pw' } };
  }

  function loginRejected(payload?: string, requestId = 'login-1') {
    return {
      type: loginWithPassword.rejected.type,
      payload,
      error: { message: 'Rejected' },
      meta: { requestId, arg: 'pw', rejectedWithValue: payload !== undefined },
    };
  }

  it('clears a previous error while the request is in flight', () => {
    const withError = sessionReducer(initialState(), loginRejected('wrong password'));
    const state = sessionReducer(withError, loginPending());
    expect(state.errorMessage).toBeNull();
  });

  it('does not flip status to bootstrapping while the request is in flight', () => {
    const awaiting = sessionReducer(initialState(), fulfilledAction(awaitingSsoPayload));
    const state = sessionReducer(awaiting, loginPending());
    expect(state.status).toBe('awaiting-sso');
  });

  it('lands an authenticated session on success', () => {
    const awaiting = sessionReducer(initialState(), fulfilledAction(awaitingSsoPayload));
    const state = sessionReducer(awaiting, loginFulfilled(dashboardPayload));
    expect(state.status).toBe('authenticated');
    expect(state.csrfToken).toBe('csrf-abc');
    expect(state.providerLabel).toBe('Chronicle dashboard');
    expect(state.tokenSource).toBe('dashboard-login');
    expect(state.user?.email).toBe('test@example.com');
    expect(state.errorMessage).toBeNull();
  });

  it('records the rejection message without leaving the login screen', () => {
    const awaiting = sessionReducer(initialState(), fulfilledAction(awaitingSsoPayload));
    const state = sessionReducer(awaiting, loginRejected('That password was not accepted.'));
    expect(state.errorMessage).toBe('That password was not accepted.');
    expect(state.status).toBe('awaiting-sso');
    expect(state.user).toBeNull();
  });

  it('falls back to a default message when the rejection carries no payload', () => {
    const state = sessionReducer(initialState(), loginRejected(undefined));
    expect(state.errorMessage).toBe('Unable to sign in to the Chronicle dashboard.');
  });
});

// ─── State transitions ──────────────────────────────────────────────────────

describe('sessionReducer — state transitions', () => {
  it('idle -> bootstrapping -> authenticated', () => {
    let state = initialState();
    expect(state.status).toBe('idle');

    state = sessionReducer(state, pendingAction());
    expect(state.status).toBe('bootstrapping');

    state = sessionReducer(state, fulfilledAction(authenticatedPayload));
    expect(state.status).toBe('authenticated');
  });

  it('idle -> bootstrapping -> awaiting-sso', () => {
    let state = initialState();
    state = sessionReducer(state, pendingAction());
    expect(state.status).toBe('bootstrapping');

    state = sessionReducer(state, fulfilledAction(awaitingSsoPayload));
    expect(state.status).toBe('awaiting-sso');
  });

  it('idle -> bootstrapping -> error', () => {
    let state = initialState();
    state = sessionReducer(state, pendingAction());
    expect(state.status).toBe('bootstrapping');

    state = sessionReducer(state, rejectedAction('network error'));
    expect(state.status).toBe('error');
    expect(state.errorMessage).toBe('network error');
  });

  it('error -> bootstrapping -> authenticated (recovery)', () => {
    let state = sessionReducer(initialState(), rejectedAction('fail'));
    expect(state.status).toBe('error');

    state = sessionReducer(state, pendingAction('req-2'));
    expect(state.status).toBe('bootstrapping');
    expect(state.errorMessage).toBeNull();

    state = sessionReducer(state, fulfilledAction(authenticatedPayload, 'req-2'));
    expect(state.status).toBe('authenticated');
    expect(state.user).not.toBeNull();
  });

  it('multiple pending-fulfilled cycles work correctly', () => {
    let state = initialState();

    // First cycle
    state = sessionReducer(state, pendingAction('r1'));
    state = sessionReducer(state, fulfilledAction(authenticatedPayload, 'r1'));
    expect(state.status).toBe('authenticated');
    expect(state.csrfToken).toBe('csrf-abc');

    // Second cycle with different payload
    state = sessionReducer(state, pendingAction('r2'));
    expect(state.status).toBe('bootstrapping');
    state = sessionReducer(
      state,
      fulfilledAction(
        {
          ...awaitingSsoPayload,
          csrfToken: 'csrf-new',
        },
        'r2',
      ),
    );
    expect(state.status).toBe('awaiting-sso');
    expect(state.csrfToken).toBe('csrf-new');
  });

  it('error -> bootstrapping -> error (repeated failures)', () => {
    let state = sessionReducer(initialState(), rejectedAction('first error'));
    expect(state.errorMessage).toBe('first error');

    state = sessionReducer(state, pendingAction('r2'));
    state = sessionReducer(state, rejectedAction('second error', 'r2'));
    expect(state.errorMessage).toBe('second error');
  });
});

// ─── Unknown actions ─────────────────────────────────────────────────────────

describe('sessionReducer — unknown actions', () => {
  it('does not modify state for unrecognized action types', () => {
    const state = initialState();
    const next = sessionReducer(state, { type: 'some/unknown/action' });
    expect(next).toEqual(state);
  });

  it('returns the same reference for unknown actions', () => {
    const state = initialState();
    const next = sessionReducer(state, { type: 'noop' });
    expect(next).toBe(state);
  });
});

// ─── Thunk action type strings ───────────────────────────────────────────────

describe('bootstrapSession — action types', () => {
  it('has correct pending type', () => {
    expect(bootstrapSession.pending.type).toBe('session/bootstrap/pending');
  });

  it('has correct fulfilled type', () => {
    expect(bootstrapSession.fulfilled.type).toBe('session/bootstrap/fulfilled');
  });

  it('has correct rejected type', () => {
    expect(bootstrapSession.rejected.type).toBe('session/bootstrap/rejected');
  });

  it('has correct typePrefix', () => {
    expect(bootstrapSession.typePrefix).toBe('session/bootstrap');
  });
});
