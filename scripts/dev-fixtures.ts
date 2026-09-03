// Auth bootstrap + benign defaults for `bun run dev:local`.
//
// Real study/participant/stats data comes from the prod DB via dev-realdata.ts.
// This file only provides:
//   - a synthetic logged-in session (local dev has no SSO), so the app boots in
//     an authenticated state instead of bouncing to the SSO landing;
//   - a benign default (200 [] for GETs, 204 otherwise) for any /chronicle/* path
//     not backed by real data, so no screen hard-errors.

const SESSION_AUTHENTICATED = {
  authMode: 'cookie-bootstrap',
  authenticated: true,
  csrfToken: 'dev-local-csrf-token',
  expiresAt: null,
  loginUrl: null,
  providerLabel: 'Local Dev',
  status: 'authenticated',
  testingLoginEnabled: true,
  tokenSource: 'testing-login',
  user: {
    email: 'researcher@local.dev',
    id: 'dev-researcher',
    name: 'Dev Researcher',
    roles: ['ADMIN', 'RESEARCHER'],
  },
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });

// Auth + benign default for a /chronicle/* request. Never returns null — every
// path that isn't backed by real data still gets a non-error response.
export function fixtureResponse(method: string, pathname: string): Response {
  const m = method.toUpperCase();

  // --- auth bootstrap (synthetic logged-in session) ---
  if (pathname === '/chronicle/v3/auth/session') return json(SESSION_AUTHENTICATED);
  if (pathname === '/chronicle/v3/auth/testing-login') return json(SESSION_AUTHENTICATED);
  if (pathname === '/chronicle/v3/auth/logout') return new Response(null, { status: 204 });

  // --- telemetry: swallow ---
  if (pathname.startsWith('/chronicle/api/web/telemetry')) return new Response(null, { status: 204 });

  // --- benign defaults: lists render empty, mutations succeed quietly ---
  if (m === 'GET') return json([]);
  return new Response(null, { status: 204 });
}
