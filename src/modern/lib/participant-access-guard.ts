import { useCallback, useEffect, useState } from 'react';

import {
  getParticipantCsrfToken,
  PARTICIPANT_PUBLIC_API_BASE,
  type ParticipantSessionContext,
  readParticipantSessionContext,
} from '@/lib/participant-access';
import { timeoutSignal } from '@/lib/request-timeout';

/** Well inside the server's 30-minute idle timeout. */
export const PARTICIPANT_KEEP_ALIVE_MS = 5 * 60_000;

/** A cheap read the session's own scope permits; any authenticated request refreshes idle expiry. */
export function participantKeepAliveUrl(context: ParticipantSessionContext): string {
  const studyId = encodeURIComponent(context.studyId);
  if (context.formKind === 'QUESTIONNAIRE' && context.resourceId) {
    return `${PARTICIPANT_PUBLIC_API_BASE}/survey/${studyId}/questionnaire/${encodeURIComponent(context.resourceId)}`;
  }
  if (context.formKind === 'TIME_USE_DIARY') return `${PARTICIPANT_PUBLIC_API_BASE}/time-use-diary/${studyId}/settings`;
  return `${PARTICIPANT_PUBLIC_API_BASE}/survey/${studyId}/app-usage-frequency`;
}

export type ParticipantKeepAliveStatus = 'active' | 'checking' | 'expired' | 'idle' | 'unavailable';

async function keepParticipantSessionAlive(): Promise<Exclude<ParticipantKeepAliveStatus, 'checking' | 'idle'>> {
  const context = readParticipantSessionContext();
  const csrfToken = getParticipantCsrfToken();
  if (!context || !csrfToken) return 'expired';
  try {
    const response = await fetch(participantKeepAliveUrl(context), {
      credentials: 'include',
      // The CSRF header picks this tab's session when another tab has since replaced the cookie.
      headers: { 'X-Chronicle-Form-CSRF': csrfToken },
      signal: timeoutSignal(),
    });
    if (response.ok) return 'active';
    return response.status === 401 || response.status === 403 ? 'expired' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/**
 * While a participant form holds answers that are not yet submitted: ask before a reload or
 * navigation (answers live only in memory, never browser storage), and keep the form session
 * from idling out while the participant is still answering without making server requests.
 */
export function useUnsavedParticipantAnswers(unsaved: boolean): {
  retry: () => void;
  status: ParticipantKeepAliveStatus;
} {
  const [status, setStatus] = useState<ParticipantKeepAliveStatus>('idle');
  const [retryCount, setRetryCount] = useState(0);
  const retry = useCallback(() => setRetryCount((count) => count + 1), []);

  useEffect(() => {
    if (!unsaved) {
      setStatus('idle');
      return;
    }
    let cancelled = false;
    let checking = false;
    const confirmLeave = (event: BeforeUnloadEvent) => event.preventDefault();
    const checkSession = async () => {
      if (checking) return;
      checking = true;
      setStatus((previous) => (previous === 'idle' ? 'checking' : previous));
      const next = await keepParticipantSessionAlive();
      checking = false;
      if (!cancelled) setStatus(next);
    };
    window.addEventListener('beforeunload', confirmLeave);
    // Refresh now too: the last request may already be most of an idle period ago.
    void checkSession();
    const keepAlive = window.setInterval(() => void checkSession(), PARTICIPANT_KEEP_ALIVE_MS);
    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', confirmLeave);
      window.clearInterval(keepAlive);
    };
  }, [retryCount, unsaved]);

  return { retry, status };
}
