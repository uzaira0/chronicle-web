// Auth endpoints use the mobile Traefik router (/chronicle/v3/...) which forwards
// the path to the backend without stripping. The web router (/chronicle/api/web/...)
// strips the prefix, causing a context path mismatch at the backend.
export const AUTH_COOKIE_ENDPOINT = '/chronicle/v3/auth/set-cookie';
export const AUTH_DASHBOARD_LOGIN_ENDPOINT = '/chronicle/v3/auth/dashboard-login';
export const AUTH_LOGIN_ENDPOINT = '/chronicle/v3/auth/oidc/login';
export const AUTH_LOGOUT_ENDPOINT = '/chronicle/v3/auth/logout';
export const AUTH_SESSION_ENDPOINT = '/chronicle/v3/auth/session';
export const AUTH_TESTING_LOGIN_ENDPOINT = '/chronicle/v3/auth/testing-login';
