// Single source of truth for cookie names, route patterns, and well-known URLs
// used by the chronicleScenario DSL. Anywhere outside this file that hand-writes
// these strings is a regression risk and is enforced by ast-grep
// (sgconfig.yml → sgrules/no-raw-auth-strings.yml).

export const CSRF_COOKIE_NAME = 'ol_csrf_token';
export const AUTH_COOKIE_NAME = 'chronicle_auth';

// API path prefixes (relative to the proxy or backend baseUrl).
export const TESTING_LOGIN_PATH = '/chronicle/v3/auth/testing-login';
export const SESSION_PATH = '/chronicle/v3/auth/session';
export const FLUSH_PIPELINE_PATH = '/chronicle/v3/admin/test-only/flush-pipeline';

export const STABLE_UNAUTHENTICATED_SESSION = {
  authenticated: false,
  providerLabel: 'Institutional SSO',
  status: 'awaiting-sso',
  testingLoginEnabled: false,
  tokenSource: 'sso-session',
} as const;

// Shell/routing specs need a session that gets past the login gate: since the dashboard
// login landed, an unauthenticated session renders the sign-in page instead of the shell.
export const STABLE_AUTHENTICATED_SESSION = {
  authenticated: true,
  authMode: 'cookie-bootstrap',
  csrfToken: 'stable-e2e-csrf-token',
  expiresAt: 1_900_000_000_000,
  providerLabel: 'Chronicle dashboard',
  status: 'authenticated',
  testingLoginEnabled: false,
  tokenSource: 'dashboard-login',
  user: {
    email: 'e2e@example.com',
    id: 'e2e-user',
    name: 'E2E User',
    roles: ['admin'],
  },
} as const;

// Glob pattern for context.route() — Playwright route patterns use minimatch globs.
export const TESTING_LOGIN_ROUTE_GLOB = `**${TESTING_LOGIN_PATH}`;

// Direct (non-proxy) backend URL for adversary-style raw HTTP probes that must
// bypass the proxy (e.g. testing that requests *without* host-scoped cookies
// return 401). Override via CHRONICLE_DIRECT_BACKEND_URL when running against a
// different harness; defaults to the standard testcontainer harness port.
export const DIRECT_BACKEND_URL: string =
  process.env.CHRONICLE_DIRECT_BACKEND_URL ?? 'http://localhost:40320';

// Default for the bun preview proxy that fronts the test backend. The
// Playwright config and DSL providers both honor CHRONICLE_PROXY_BASE_URL.
export const PROXY_BASE_URL_DEFAULT: string =
  process.env.CHRONICLE_PROXY_BASE_URL ?? 'http://127.0.0.1:4173';

export const HEADER_CSRF_TOKEN = 'X-CSRF-Token';
export const HEADER_CONTENT_TYPE = 'Content-Type';
export const HEADER_AUTHORIZATION = 'Authorization';

export const MIME_JSON = 'application/json';
