import { describe, expect, it } from 'bun:test';

import { bootstrapSession, sessionReducer } from './session-slice';

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

describe('session slice state snapshots', () => {
  describe('initial state shape', () => {
    it('default initial state', () => {
      expect(initialState()).toMatchSnapshot();
    });
  });

  describe('state after pending action', () => {
    it('from idle', () => {
      expect(sessionReducer(initialState(), pendingAction())).toMatchSnapshot();
    });

    it('from error state (clears errorMessage)', () => {
      const errorState = sessionReducer(initialState(), rejectedAction('previous failure'));
      expect(sessionReducer(errorState, pendingAction('req-2'))).toMatchSnapshot();
    });
  });

  describe('state after fulfilled action', () => {
    it('authenticated with user', () => {
      const pending = sessionReducer(initialState(), pendingAction());
      expect(sessionReducer(pending, fulfilledAction(authenticatedPayload))).toMatchSnapshot();
    });

    it('awaiting SSO (user is null)', () => {
      const pending = sessionReducer(initialState(), pendingAction());
      expect(sessionReducer(pending, fulfilledAction(awaitingSsoPayload))).toMatchSnapshot();
    });

    it('fulfilled after prior error (clears errorMessage)', () => {
      let state = sessionReducer(initialState(), rejectedAction('old error'));
      state = sessionReducer(state, pendingAction('req-2'));
      expect(sessionReducer(state, fulfilledAction(authenticatedPayload, 'req-2'))).toMatchSnapshot();
    });
  });

  describe('state after rejected action', () => {
    it('with explicit error payload', () => {
      const pending = sessionReducer(initialState(), pendingAction());
      expect(sessionReducer(pending, rejectedAction('Network timeout'))).toMatchSnapshot();
    });

    it('with undefined payload uses default message', () => {
      const pending = sessionReducer(initialState(), pendingAction());
      expect(sessionReducer(pending, rejectedAction(undefined))).toMatchSnapshot();
    });
  });

  describe('multi-step transitions', () => {
    it('idle -> pending -> authenticated -> pending -> awaiting-sso', () => {
      let state = initialState();
      state = sessionReducer(state, pendingAction('r1'));
      state = sessionReducer(state, fulfilledAction(authenticatedPayload, 'r1'));
      state = sessionReducer(state, pendingAction('r2'));
      state = sessionReducer(state, fulfilledAction(awaitingSsoPayload, 'r2'));
      expect(state).toMatchSnapshot();
    });

    it('idle -> pending -> error -> pending -> authenticated (recovery)', () => {
      let state = initialState();
      state = sessionReducer(state, pendingAction('r1'));
      state = sessionReducer(state, rejectedAction('fail', 'r1'));
      state = sessionReducer(state, pendingAction('r2'));
      state = sessionReducer(state, fulfilledAction(authenticatedPayload, 'r2'));
      expect(state).toMatchSnapshot();
    });
  });
});
