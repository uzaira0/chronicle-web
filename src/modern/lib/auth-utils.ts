import { AUTH_LOGOUT_ENDPOINT } from '@/lib/auth-endpoints';

import type { RootState } from '@/state/store';

/**
 * Selector: returns true when the session user has the 'admin' role.
 * Use with `useAppSelector(selectIsAdmin)` in React components.
 */
export function selectIsAdmin(state: RootState): boolean {
  const roles = state.session.user?.roles;
  return Array.isArray(roles) && roles.includes('admin');
}

/**
 * Selector: returns the session user's display name or email, or null.
 */
export function selectUserDisplayName(state: RootState): string | null {
  const user = state.session.user;
  if (!user) return null;
  return user.name ?? user.email ?? null;
}

/**
 * Logs out the current session by calling the backend logout endpoint to
 * clear the httpOnly auth cookie, then reloads the page to reset all
 * client-side state (RTK store, in-memory caches, etc.).
 *
 * This replaces the legacy clearAuthInfo + logout action + logoutWatcher saga.
 */
export async function logoutSession(): Promise<void> {
  try {
    await fetch(AUTH_LOGOUT_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch {
    // Best-effort: if the endpoint is unreachable the cookie will expire naturally.
  }

  // Clear any non-sensitive localStorage artifacts from the legacy auth system.
  localStorage.removeItem('chronicle_user_info');
  localStorage.removeItem('auth0_user_info');
  localStorage.removeItem('auth0_id_token');

  // Full reload so the bootstrap flow detects the missing session and redirects
  // to the SSO / awaiting-sso state.
  window.location.replace(`${window.location.origin}/`);
}
