import { AUTH_LOGOUT_ENDPOINT } from '@/lib/auth-endpoints';
import { timeoutSignal } from '@/lib/request-timeout';

import type { RootState } from '@/state/store';

export const SIGN_OUT_FAILED_MESSAGE = 'Sign-out did not complete. Retry before leaving this workstation.';

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
    const response = await fetch(AUTH_LOGOUT_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      signal: timeoutSignal(),
    });
    if (!response.ok) throw new Error(SIGN_OUT_FAILED_MESSAGE);
  } catch {
    throw new Error(SIGN_OUT_FAILED_MESSAGE);
  }

  // Clear any non-sensitive localStorage artifacts from the legacy auth system.
  localStorage.removeItem('chronicle_user_info');
  localStorage.removeItem('auth0_user_info');
  localStorage.removeItem('auth0_id_token');

  // Full reload so the bootstrap flow detects the missing session and redirects
  // to the SSO / awaiting-sso state.
  window.location.replace(`${window.location.origin}/`);
}
