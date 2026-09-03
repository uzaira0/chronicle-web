import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { bootstrapSession, sessionReducer } from './session-slice';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const initialState = {
  authMode: 'institutional-sso' as const,
  backendCompatibility: 'operational' as const,
  csrfToken: null,
  errorMessage: null,
  expiresAt: null,
  hasAppShell: true,
  loginUrl: null,
  providerLabel: 'Institutional SSO',
  status: 'idle' as const,
  testingLoginEnabled: false,
  tokenSource: null,
  user: null,
};

const sessionUserArb = fc.record({
  email: fc.option(fc.emailAddress(), { nil: null }),
  id: fc.option(fc.uuid(), { nil: null }),
  name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  roles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
});

const bootstrapSessionArb = fc.record({
  authMode: fc.constantFrom('cookie-bootstrap' as const, 'institutional-sso' as const),
  csrfToken: fc.option(fc.string({ minLength: 10, maxLength: 64 }), { nil: null }),
  expiresAt: fc.option(fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 }), { nil: null }),
  loginUrl: fc.option(fc.webUrl(), { nil: null }),
  providerLabel: fc.string({ minLength: 1, maxLength: 40 }),
  status: fc.constantFrom('authenticated' as const, 'awaiting-sso' as const),
  testingLoginEnabled: fc.boolean(),
  tokenSource: fc.constantFrom('sso-session' as const, 'testing-login' as const),
  user: fc.option(sessionUserArb, { nil: null }),
});

const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 });

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('sessionReducer properties', () => {
  it('pending action clears errorMessage and sets status to bootstrapping', () => {
    fc.assert(
      fc.property(errorMessageArb, (priorError) => {
        const stateWithError = { ...initialState, errorMessage: priorError, status: 'error' as const };
        const next = sessionReducer(stateWithError, bootstrapSession.pending('test-request-id'));
        expect(next.errorMessage).toBeNull();
        expect(next.status).toBe('bootstrapping');
      }),
    );
  });

  it('fulfilled action applies all payload fields to state', () => {
    fc.assert(
      fc.property(bootstrapSessionArb, (payload) => {
        const pendingState = { ...initialState, status: 'bootstrapping' as const };
        const action = bootstrapSession.fulfilled(payload, 'test-request-id');
        const next = sessionReducer(pendingState, action);
        expect(next.authMode).toBe(payload.authMode);
        expect(next.csrfToken).toBe(payload.csrfToken);
        expect(next.expiresAt).toBe(payload.expiresAt);
        expect(next.providerLabel).toBe(payload.providerLabel);
        expect(next.status).toBe(payload.status);
        expect(next.tokenSource).toBe(payload.tokenSource);
        expect(next.user).toEqual(payload.user);
        expect(next.errorMessage).toBeNull();
      }),
    );
  });

  it('rejected action sets error status and preserves error message', () => {
    fc.assert(
      fc.property(errorMessageArb, (message) => {
        const pendingState = { ...initialState, status: 'bootstrapping' as const };
        const action = bootstrapSession.rejected(null, 'test-request-id', undefined, message);
        const next = sessionReducer(pendingState, action);
        expect(next.status).toBe('error');
        expect(next.errorMessage).toBe(message);
      }),
    );
  });

  it('rejected without payload uses default error message', () => {
    const pendingState = { ...initialState, status: 'bootstrapping' as const };
    const action = bootstrapSession.rejected(new Error('test'), 'test-request-id');
    const next = sessionReducer(pendingState, action);
    expect(next.status).toBe('error');
    expect(next.errorMessage).toBe('Unable to initialize the Chronicle session.');
  });

  it('reducer returns initial state for unknown actions', () => {
    const next = sessionReducer(undefined, { type: 'UNKNOWN_ACTION' });
    expect(next).toEqual(initialState);
  });

  it('state transitions are deterministic (same input, same output)', () => {
    fc.assert(
      fc.property(bootstrapSessionArb, (payload) => {
        const action = bootstrapSession.fulfilled(payload, 'test-request-id');
        const result1 = sessionReducer(initialState, action);
        const result2 = sessionReducer(initialState, action);
        expect(result1).toEqual(result2);
      }),
    );
  });

  it('fulfilled never leaves status as bootstrapping or error', () => {
    fc.assert(
      fc.property(bootstrapSessionArb, (payload) => {
        const action = bootstrapSession.fulfilled(payload, 'test-request-id');
        const next = sessionReducer(initialState, action);
        expect(next.status).not.toBe('bootstrapping');
        expect(next.status).not.toBe('error');
      }),
    );
  });
});
