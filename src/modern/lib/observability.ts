import {
  BROWSER_ERROR_KIND,
  BROWSER_ERROR_REPORT_PATH,
  type BrowserErrorKind,
  RESEARCHER_CSRF_HEADER,
} from '@/generated/chronicle-contracts';
import { getResearcherCsrfToken } from '@/lib/bootstrap-auth';
import { timeoutSignal } from '@/lib/request-timeout';

/** Best-effort counters accept only finite categories, never exception content or page identity. */
export function reportError(kind: BrowserErrorKind = BROWSER_ERROR_KIND.ERROR): void {
  try {
    const csrf = getResearcherCsrfToken();
    void fetch(BROWSER_ERROR_REPORT_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { [RESEARCHER_CSRF_HEADER]: csrf } : {}) },
      body: JSON.stringify({ kind }),
      keepalive: true,
      signal: timeoutSignal(),
    }).catch(() => undefined);
  } catch {
    // Reporting remains best effort when browser storage or networking is unavailable.
  }
}

export function initGlobalErrorHandlers(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const error = () => reportError();
  const rejection = () => reportError(BROWSER_ERROR_KIND.UNHANDLED_REJECTION);
  window.addEventListener('error', error);
  window.addEventListener('unhandledrejection', rejection);
  return () => {
    window.removeEventListener('error', error);
    window.removeEventListener('unhandledrejection', rejection);
  };
}
