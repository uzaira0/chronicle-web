import { createAsyncThunk, createListenerMiddleware, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { logoutSession as performLogout, SIGN_OUT_FAILED_MESSAGE } from '@/lib/auth-utils';
import {
  type BootstrapSession,
  initializeBootstrapSession,
  requestDashboardLogin,
  type SessionUser,
} from '@/lib/bootstrap-auth';

// Rendered by `SessionBootstrap`, which maps these English sentences to translated copy.
// State stays serializable and language-agnostic, so the stored value is the English one.
export const SESSION_INIT_FAILED_MESSAGE = 'Unable to initialize the Chronicle session.';
export const UNKNOWN_BOOTSTRAP_FAILURE_MESSAGE = 'Unknown bootstrap failure.';
export const DASHBOARD_SIGN_IN_FAILED_MESSAGE = 'Unable to sign in to the Chronicle dashboard.';

export const SESSION_STATUS = {
  idle: 'idle',
  bootstrapping: 'bootstrapping',
  authenticated: 'authenticated',
  awaitingSso: 'awaiting-sso',
  error: 'error',
  locked: 'locked',
  signingOut: 'signing-out',
} as const;

type SessionState = {
  authMode: 'cookie-bootstrap' | 'institutional-sso';
  backendCompatibility: 'legacy' | 'operational';
  csrfToken: string | null;
  errorMessage: string | null;
  expiresAt: number | null;
  idleExpiresAt: number | null;
  hasAppShell: boolean;
  loginUrl: string | null;
  providerLabel: string;
  status: (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];
  tokenSource: 'sso-session' | 'testing-login' | 'dashboard-login' | null;
  testingLoginEnabled: boolean;
  user: SessionUser | null;
};

const initialState: SessionState = {
  authMode: 'institutional-sso',
  backendCompatibility: 'operational',
  csrfToken: null,
  errorMessage: null,
  expiresAt: null,
  idleExpiresAt: null,
  hasAppShell: true,
  loginUrl: null,
  providerLabel: 'Institutional SSO',
  status: SESSION_STATUS.idle,
  tokenSource: null,
  testingLoginEnabled: false,
  user: null,
};

export const bootstrapSession = createAsyncThunk<BootstrapSession, void, { rejectValue: string }>(
  'session/bootstrap',
  async (_void, thunkApi) => {
    try {
      return await initializeBootstrapSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : UNKNOWN_BOOTSTRAP_FAILURE_MESSAGE;
      return thunkApi.rejectWithValue(message);
    }
  },
);

export const loginWithPassword = createAsyncThunk<BootstrapSession, string, { rejectValue: string }>(
  'session/loginWithPassword',
  async (password, thunkApi) => {
    try {
      return await requestDashboardLogin(password);
    } catch (error) {
      const message = error instanceof Error ? error.message : DASHBOARD_SIGN_IN_FAILED_MESSAGE;
      return thunkApi.rejectWithValue(message);
    }
  },
);

export const logoutSession = createAsyncThunk<void, void>('session/logout', async () => {
  await performLogout();
});

export const sessionListenerMiddleware = createListenerMiddleware();

/** Keep failed requests pending while the login screen preserves their callers' drafts. */
export function waitForReauthentication(signal: AbortSignal, userId: string | null): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (authenticated: boolean) => {
      unsubscribe();
      signal.removeEventListener('abort', abort);
      resolve(authenticated);
    };
    const abort = () => finish(false);
    const unsubscribe = sessionListenerMiddleware.startListening({
      predicate: (action) =>
        loginWithPassword.fulfilled.match(action) ||
        bootstrapSession.fulfilled.match(action) ||
        logoutSession.fulfilled.match(action),
      effect: (_action, api) => {
        const session = (api.getState() as { session: SessionState }).session;
        finish(session.status === SESSION_STATUS.authenticated && (session.user?.id ?? null) === userId);
      },
    });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

function applySession(state: SessionState, payload: BootstrapSession): void {
  state.authMode = payload.authMode;
  state.csrfToken = payload.csrfToken;
  state.errorMessage = null;
  state.expiresAt = payload.expiresAt;
  state.idleExpiresAt = payload.idleExpiresAt ?? null;
  state.loginUrl = payload.loginUrl;
  state.providerLabel = payload.providerLabel;
  state.status = payload.status;
  state.tokenSource = payload.tokenSource;
  state.testingLoginEnabled = payload.testingLoginEnabled;
  state.user = payload.user;
}

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    updateIdleDeadline(state, action: PayloadAction<number>) {
      if (state.status === SESSION_STATUS.authenticated && Number.isFinite(action.payload))
        state.idleExpiresAt = Math.max(state.idleExpiresAt ?? action.payload, action.payload);
    },
    expireSession(state) {
      if (state.status !== SESSION_STATUS.authenticated) return;
      state.status = SESSION_STATUS.locked;
      state.csrfToken = null;
      state.errorMessage = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapSession.pending, (state) => {
        state.errorMessage = null;
        state.status = SESSION_STATUS.bootstrapping;
      })
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        applySession(state, action.payload);
      })
      .addCase(bootstrapSession.rejected, (state, action) => {
        state.errorMessage = action.payload ?? SESSION_INIT_FAILED_MESSAGE;
        state.status = SESSION_STATUS.error;
      })
      .addCase(loginWithPassword.pending, (state) => {
        state.errorMessage = null;
      })
      .addCase(loginWithPassword.fulfilled, (state, action) => {
        applySession(state, action.payload);
      })
      // A rejected password must leave `status` alone: flipping it to 'error' would swap the
      // login page for the bootstrap error panel and strand the user with no way to retype.
      .addCase(loginWithPassword.rejected, (state, action) => {
        state.errorMessage = action.payload ?? DASHBOARD_SIGN_IN_FAILED_MESSAGE;
      })
      .addCase(logoutSession.pending, (state) => {
        state.status = SESSION_STATUS.signingOut;
        state.errorMessage = null;
      })
      .addCase(logoutSession.rejected, (state) => {
        state.status = SESSION_STATUS.locked;
        state.errorMessage = SIGN_OUT_FAILED_MESSAGE;
      })
      .addCase(logoutSession.fulfilled, (state) => {
        state.status = SESSION_STATUS.idle;
        state.user = null;
        state.csrfToken = null;
        state.expiresAt = null;
        state.idleExpiresAt = null;
        state.loginUrl = null;
        state.tokenSource = null;
      });
  },
});

export const sessionReducer = sessionSlice.reducer;
export const { expireSession, updateIdleDeadline } = sessionSlice.actions;

export function sessionDeadline(session: Pick<SessionState, 'expiresAt' | 'idleExpiresAt'>): number | null {
  const deadlines = [session.expiresAt, session.idleExpiresAt].filter((value): value is number => value != null);
  return deadlines.length ? Math.min(...deadlines) : null;
}
