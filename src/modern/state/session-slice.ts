import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { logoutSession as performLogout } from '@/lib/auth-utils';
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

type SessionState = {
  authMode: 'cookie-bootstrap' | 'institutional-sso';
  backendCompatibility: 'legacy' | 'operational';
  csrfToken: string | null;
  errorMessage: string | null;
  expiresAt: number | null;
  hasAppShell: boolean;
  loginUrl: string | null;
  providerLabel: string;
  status: 'idle' | 'bootstrapping' | 'authenticated' | 'awaiting-sso' | 'error';
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
  hasAppShell: true,
  loginUrl: null,
  providerLabel: 'Institutional SSO',
  status: 'idle',
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

function applySession(state: SessionState, payload: BootstrapSession): void {
  state.authMode = payload.authMode;
  state.csrfToken = payload.csrfToken;
  state.errorMessage = null;
  state.expiresAt = payload.expiresAt;
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
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapSession.pending, (state) => {
        state.errorMessage = null;
        state.status = 'bootstrapping';
      })
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        applySession(state, action.payload);
      })
      .addCase(bootstrapSession.rejected, (state, action) => {
        state.errorMessage = action.payload ?? SESSION_INIT_FAILED_MESSAGE;
        state.status = 'error';
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
        state.status = 'idle';
        state.user = null;
        state.csrfToken = null;
        state.expiresAt = null;
        state.loginUrl = null;
        state.tokenSource = null;
      });
  },
});

export const sessionReducer = sessionSlice.reducer;
