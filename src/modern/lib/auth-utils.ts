import { AUTH_LOGOUT_ENDPOINT } from '@/lib/auth-endpoints';
import { timeoutSignal } from '@/lib/request-timeout';

export const SIGN_OUT_FAILED_MESSAGE = 'Sign-out did not complete. Retry before leaving this workstation.';
export const SESSION_LOGOUT_CHANNEL = 'chronicle-session-logout';

function reloadSignedOutSession(): void {
  window.location.replace(`${window.location.origin}/`);
}

/**
 * Logs out the current session by calling the backend logout endpoint to
 * clear the httpOnly auth cookie, then reloads the page to reset all
 * client-side state (RTK store, in-memory caches, etc.).
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

  const channel = new BroadcastChannel(SESSION_LOGOUT_CHANNEL);
  channel.postMessage(null);
  channel.close();

  reloadSignedOutSession();
}
