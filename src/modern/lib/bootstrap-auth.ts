import {
  AUTH_DASHBOARD_LOGIN_ENDPOINT,
  AUTH_SESSION_ENDPOINT,
  AUTH_TESTING_LOGIN_ENDPOINT,
} from '@/lib/auth-endpoints';
import { getErrorMessage } from '@/lib/errors';

const CSRF_COOKIE = 'ol_csrf_token';
const INSTITUTIONAL_SSO_LABEL = 'Institutional SSO';
const TESTING_PROVIDER_LABEL = 'Chronicle testing session';
const DASHBOARD_PROVIDER_LABEL = 'Chronicle dashboard';

// User-facing copy for every way the dashboard password exchange can fail. These are read
// verbatim by the login page, so they must stay free of internal detail.
export const DASHBOARD_LOGIN_REJECTED_MESSAGE = 'That password was not accepted. Check it and try again.';
export const DASHBOARD_LOGIN_RATE_LIMITED_MESSAGE = 'Too many sign-in attempts. Wait a minute before trying again.';
export const DASHBOARD_LOGIN_UNAVAILABLE_MESSAGE = 'Sign-in is temporarily unavailable. Try again in a moment.';

// The two transport failures below carry the HTTP status, so they cannot be compared whole.
// `SessionBootstrap` matches on these prefixes to render the translated equivalent.
export const AUTH_SESSION_FAILED_PREFIX = 'Auth session request failed with status ';
export const TESTING_LOGIN_FAILED_PREFIX = 'Testing login request failed with status ';

type JwtPayload = {
  email?: string;
  exp?: number;
  family_name?: string;
  given_name?: string;
  name?: string;
  sub?: string;
};

export type SessionUser = {
  email: string | null;
  id: string | null;
  name: string | null;
  roles: string[];
};

export type BootstrapSession = {
  authMode: 'cookie-bootstrap' | 'institutional-sso';
  csrfToken: string | null;
  expiresAt: number | null;
  loginUrl: string | null;
  providerLabel: string;
  status: 'authenticated' | 'awaiting-sso';
  tokenSource: 'sso-session' | 'testing-login' | 'dashboard-login';
  testingLoginEnabled: boolean;
  user: SessionUser | null;
};

function getCookie(name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  const cookieValue = match?.[1];
  return cookieValue ? decodeURIComponent(cookieValue) : null;
}

function toSessionUser(payload: JwtPayload | SessionUser | null): SessionUser | null {
  if (!payload) {
    return null;
  }

  if ('roles' in payload && 'id' in payload && 'email' in payload && 'name' in payload) {
    return payload;
  }

  const displayName = payload.name ?? [payload.given_name, payload.family_name].filter(Boolean).join(' ');

  return {
    email: payload.email ?? null,
    id: payload.sub ?? null,
    name: displayName || null,
    // Authorization roles are accepted only from the server-normalized SessionUser shape.
    // Raw JWT claim namespaces are deployment-specific and must not be interpreted in-browser.
    roles: [],
  };
}

type ServerSessionResponse = {
  authenticated?: boolean;
  authMode?: BootstrapSession['authMode'];
  csrfToken?: string | null;
  expiresAt?: number | null;
  loginUrl?: string | null;
  providerLabel?: string;
  status?: BootstrapSession['status'];
  testingLoginEnabled?: boolean;
  tokenSource?: BootstrapSession['tokenSource'];
  user?: SessionUser | JwtPayload | null;
};

async function fetchServerSession(): Promise<ServerSessionResponse> {
  const response = await fetch(AUTH_SESSION_ENDPOINT, {
    credentials: 'same-origin',
  });

  // A 401 means the security filter rejected an expired/invalid cookie before
  // the controller could respond. Do not infer testing-login from this path:
  // production must only try the test bridge when the session endpoint
  // explicitly advertises it.
  if (response.status === 401) {
    return { authenticated: false, testingLoginEnabled: false };
  }

  if (!response.ok) {
    throw new Error(`${AUTH_SESSION_FAILED_PREFIX}${response.status}.`);
  }

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  return payload;
}

async function requestTestingLogin(): Promise<ServerSessionResponse | null> {
  const response = await fetch(AUTH_TESTING_LOGIN_ENDPOINT, {
    body: JSON.stringify({}),
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (response.status === 403) {
    return null;
  }

  if (response.status === 500) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${TESTING_LOGIN_FAILED_PREFIX}${response.status}.`);
  }

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return payload;
}

async function readJsonObject(response: Response): Promise<ServerSessionResponse & { error?: string }> {
  try {
    const payload = (await response.json()) as unknown;
    return payload && typeof payload === 'object' ? payload : {};
  } catch {
    return {};
  }
}

/**
 * Exchanges the dashboard password for a session cookie. The backend sets `chronicle_auth`
 * and `ol_csrf_token` on the response, so — exactly like the testing-login bridge — this
 * sends no CSRF header and reads the token back out of the response body or the cookie.
 */
export async function requestDashboardLogin(password: string): Promise<BootstrapSession> {
  let response: Response;
  try {
    response = await fetch(AUTH_DASHBOARD_LOGIN_ENDPOINT, {
      body: JSON.stringify({ password }),
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
  } catch {
    throw new Error(DASHBOARD_LOGIN_UNAVAILABLE_MESSAGE);
  }

  if (response.status === 429) {
    throw new Error(DASHBOARD_LOGIN_RATE_LIMITED_MESSAGE);
  }

  if (response.status === 401) {
    throw new Error(getErrorMessage(await readJsonObject(response), DASHBOARD_LOGIN_REJECTED_MESSAGE));
  }

  if (!response.ok) {
    throw new Error(DASHBOARD_LOGIN_UNAVAILABLE_MESSAGE);
  }

  const payload = await readJsonObject(response);
  if (!payload.authenticated) {
    throw new Error(getErrorMessage(payload, DASHBOARD_LOGIN_REJECTED_MESSAGE));
  }

  return toAuthenticatedBootstrapSession(
    payload,
    DASHBOARD_PROVIDER_LABEL,
    'dashboard-login',
    payload.testingLoginEnabled ?? false,
  );
}

function toAuthenticatedBootstrapSession(
  session: ServerSessionResponse,
  providerLabel: string,
  tokenSource: BootstrapSession['tokenSource'],
  testingLoginEnabled: boolean,
): BootstrapSession {
  return {
    authMode: session.authMode ?? 'cookie-bootstrap',
    csrfToken: session.csrfToken ?? getCookie(CSRF_COOKIE),
    expiresAt: session.expiresAt ?? null,
    loginUrl: null,
    providerLabel: session.providerLabel ?? providerLabel,
    status: session.status ?? 'authenticated',
    testingLoginEnabled,
    tokenSource: session.tokenSource ?? tokenSource,
    user: toSessionUser(session.user ?? null),
  };
}

function toAwaitingSsoSession(session: ServerSessionResponse): BootstrapSession {
  return {
    authMode: 'institutional-sso',
    csrfToken: session.csrfToken ?? getCookie(CSRF_COOKIE),
    expiresAt: null,
    loginUrl: session.loginUrl ?? null,
    providerLabel: session.providerLabel ?? INSTITUTIONAL_SSO_LABEL,
    status: 'awaiting-sso',
    testingLoginEnabled: session.testingLoginEnabled ?? false,
    tokenSource: 'sso-session',
    user: null,
  };
}

export async function initializeBootstrapSession(): Promise<BootstrapSession> {
  const session = await fetchServerSession();
  const testingLoginEnabled = session.testingLoginEnabled ?? false;

  if (session.authenticated) {
    return toAuthenticatedBootstrapSession(session, INSTITUTIONAL_SSO_LABEL, 'sso-session', testingLoginEnabled);
  }

  if (session.testingLoginEnabled) {
    const testingSession = await requestTestingLogin();
    if (testingSession?.authenticated) {
      return toAuthenticatedBootstrapSession(
        testingSession,
        TESTING_PROVIDER_LABEL,
        'testing-login',
        testingLoginEnabled || testingSession.testingLoginEnabled === true,
      );
    }
  }

  return toAwaitingSsoSession(session);
}
