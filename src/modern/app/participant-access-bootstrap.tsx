import { LoaderCircle, RefreshCcw, ShieldAlert } from 'lucide-react';
import { type PropsWithChildren, useEffect, useMemo, useRef, useState } from 'react';
import { matchPath, useLocation } from 'react-router';

import { StatePanel } from '@/components/state-panel';
import { Button } from '@/components/ui/button';
import { useTranslator } from '@/i18n';
import { isRetryableHttpStatus } from '@/lib/errors';
import {
  PARTICIPANT_CONTEXT_STORAGE_KEY,
  ParticipantAccessError,
  type ParticipantFormKind,
  type ParticipantSessionContext,
  parseParticipantSessionContext,
  participantAccessCodeFromFragment,
  participantAccessExchangeUrl,
  readParticipantSessionContext,
  recoverParticipantSessionContext,
  requireParticipantProcessingAvailable,
  storeParticipantSessionContext,
} from '@/lib/participant-access';
import { timeoutSignal } from '@/lib/request-timeout';
import { PARTICIPANT_ROUTE_PATHS } from '@/lib/route-links';
import { acknowledgeResearcherCreate, researcherCreateIntent } from '@/lib/use-researcher-create-intent';

// Access depends only on the link and the session; the error is kept as a catalog key, so a language switch
// re-renders its text without re-running access (which would remount the form and drop unsent answers).
type AccessState =
  | { context: ParticipantSessionContext; status: 'ready' }
  | { messageKey: string; retryable: boolean; newLinkRequired?: boolean; status: 'error' }
  | {
      status: 'loading';
    };

function expectedKind(pathname: string): ParticipantFormKind {
  const routes = Object.entries(PARTICIPANT_ROUTE_PATHS) as [ParticipantFormKind, string][];
  return routes.find(([, path]) => matchPath(path, pathname))?.[0] ?? 'PORTAL';
}

function contextMatchesLocation(context: ParticipantSessionContext, pathname: string, search: string): boolean {
  const params = new URLSearchParams(search);
  const requestedKind = expectedKind(pathname);
  if (context.studyId !== params.get('studyId') || context.participantId !== params.get('participantId')) return false;
  if (context.formKind !== 'PORTAL' && context.formKind !== requestedKind) return false;
  if (requestedKind === 'QUESTIONNAIRE' && context.resourceId !== params.get('questionnaireId')) return false;
  return !(context.logicalDate && params.get('date') && context.logicalDate !== params.get('date'));
}

function removeAccessCodeFromAddressBar(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('accessCode');
  if (new URLSearchParams(url.hash.replace(/^#/, '')).has('accessCode')) url.hash = '';
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

// StrictMode remounts share a request. Failed exchanges retry with the same durable attempt;
// an acknowledged exchange remains available while a browser-storage retry is pending.
const exchangesInFlight = new Map<string, Promise<ParticipantSessionContext>>();

async function readExchangeResponse(response: Response): Promise<ParticipantSessionContext> {
  await requireParticipantProcessingAvailable(response);
  if (response.status === 401 || response.status === 410) {
    const recovered = await recoverParticipantSessionContext();
    if (recovered) return recovered;
    throw new ParticipantAccessError('participant_access.link_invalid', false, true);
  }
  if (!response.ok) {
    const retryable = isRetryableHttpStatus(response.status);
    const key = retryable
      ? 'enrollment.error_server'
      : response.status === 409
        ? 'participant_access.inactive'
        : 'participant_access.request_rejected';
    throw new ParticipantAccessError(key, retryable);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) throw new ParticipantAccessError('participant_access.error_response');
    throw error;
  }
  const context = parseParticipantSessionContext(payload);
  if (!context) throw new ParticipantAccessError('participant_access.error_response');
  return context;
}

function exchangeOnce(accessCode: string): Promise<ParticipantSessionContext> {
  const pending = exchangesInFlight.get(accessCode);
  if (pending) return pending;
  const request = researcherCreateIntent(participantAccessExchangeUrl(), accessCode, null)
    .then(async (intent) => {
      const response = await fetch(participantAccessExchangeUrl(), {
        body: JSON.stringify({ accessCode, attemptId: intent.key }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: timeoutSignal(),
      });
      // A code the server refused never succeeds on retry, so its attempt is forgotten like a completed one.
      const context = await readExchangeResponse(response).catch(async (error: unknown) => {
        const refused = !response.ok && error instanceof ParticipantAccessError && !error.retryable;
        if (refused) await acknowledgeResearcherCreate(intent);
        throw error;
      });
      await acknowledgeResearcherCreate(intent);
      return context;
    })
    .catch((error: unknown) => {
      exchangesInFlight.delete(accessCode);
      throw error;
    });
  exchangesInFlight.set(accessCode, request);
  return request;
}

function useParticipantAccess() {
  const location = useLocation();
  const accessCode = useMemo(() => participantAccessCodeFromFragment(location.hash), [location.hash]);
  const [state, setState] = useState<AccessState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // The router can retain the removed fragment; its consumed code must not replace a newer stored session.
  const consumedCode = useRef<string | null>(null);
  useEffect(() => {
    const changed = (event: Event) => {
      if (
        event instanceof StorageEvent &&
        (event.storageArea !== window.sessionStorage ||
          (event.key !== null && event.key !== PARTICIPANT_CONTEXT_STORAGE_KEY))
      )
        return;
      setAttempt((value) => value + 1);
    };
    window.addEventListener(PARTICIPANT_CONTEXT_STORAGE_KEY, changed);
    window.addEventListener('storage', changed);
    return () => {
      window.removeEventListener(PARTICIPANT_CONTEXT_STORAGE_KEY, changed);
      window.removeEventListener('storage', changed);
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the explicit retry trigger.
  useEffect(() => {
    let cancelled = false;
    if (new URLSearchParams(location.search).has('accessCode')) removeAccessCodeFromAddressBar();
    const existing = readParticipantSessionContext();
    const request =
      accessCode && accessCode !== consumedCode.current
        ? exchangeOnce(accessCode)
        : existing && contextMatchesLocation(existing, location.pathname, location.search)
          ? Promise.resolve(existing)
          : recoverParticipantSessionContext();
    setState({ status: 'loading' });
    void request
      .then((context) => {
        if (cancelled) return;
        if (!context) throw new ParticipantAccessError('participant_access.missing_code');
        if (!contextMatchesLocation(context, location.pathname, location.search))
          throw new ParticipantAccessError('participant_access.link_mismatch');
        try {
          storeParticipantSessionContext(context);
          consumedCode.current = accessCode;
        } catch {
          throw new ParticipantAccessError('participant_access.storage_failed', true);
        }
        removeAccessCodeFromAddressBar();
        setState({ context, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const refused = error instanceof ParticipantAccessError;
        setState({
          messageKey: refused ? error.messageKey : 'participant_access.not_established',
          retryable: refused ? error.retryable : true,
          newLinkRequired: refused && error.newLinkRequired,
          status: 'error',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [accessCode, attempt, location.pathname, location.search]);
  return { state, retry: () => setAttempt((value) => value + 1) };
}

export function ParticipantAccessBootstrap({ children }: PropsWithChildren) {
  const { state, retry } = useParticipantAccess();
  const { t } = useTranslator();
  if (state.status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <StatePanel
          description={t('participant_access.loading_description')}
          eyebrow={t('participant_access.eyebrow')}
          icon={<LoaderCircle className="h-5 w-5 animate-spin" />}
          title={t('participant_access.loading_title')}
        />
      </main>
    );
  }
  if (state.status === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <StatePanel
          actions={
            state.retryable && (
              <Button onClick={retry} variant="default">
                <RefreshCcw className="mr-2 h-4 w-4" />
                {t('common.try_again')}
              </Button>
            )
          }
          description={t(state.messageKey)}
          eyebrow={t('participant_access.eyebrow')}
          icon={<ShieldAlert className="h-5 w-5" />}
          title={t(state.newLinkRequired ? 'participant_access.error_title' : 'participant_access.unavailable_title')}
          tone="destructive"
        />
      </main>
    );
  }
  return children;
}
