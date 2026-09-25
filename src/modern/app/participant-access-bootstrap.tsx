import { LoaderCircle, RefreshCcw, ShieldAlert } from 'lucide-react';
import { type PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';

import { StatePanel } from '@/components/state-panel';
import { Button } from '@/components/ui/button';
import { createTranslator, getCurrentLanguage, useTranslator } from '@/i18n';
import {
  type ParticipantFormKind,
  type ParticipantSessionContext,
  participantAccessCodeFromFragment,
  participantAccessExchangeUrl,
  readParticipantSessionContext,
  storeParticipantSessionContext,
} from '@/lib/participant-access';
import { timeoutSignal } from '@/lib/request-timeout';

type AccessState =
  | { context: ParticipantSessionContext; status: 'ready' }
  | { message: string; retryable: boolean; status: 'error' }
  | {
      status: 'loading';
    };

function expectedKind(pathname: string): ParticipantFormKind {
  if (pathname.endsWith('/questionnaire')) return 'QUESTIONNAIRE';
  if (pathname.endsWith('/survey')) return 'APP_USAGE';
  if (pathname.endsWith('/time-use-diary')) return 'TIME_USE_DIARY';
  return 'PORTAL';
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

// An access code is single-use: the backend stamps `exchanged_at` and refuses the second
// attempt. So the exchange must happen at most once per code no matter how many times this
// component mounts or its effect re-runs — under StrictMode that is twice on the first load,
// and the second call would report the participant's own, still-valid link as spent.
// Module scope, not a ref: a ref is recreated by the very remount this has to survive.
const exchangesInFlight = new Map<string, Promise<ParticipantSessionContext>>();

// A refusal we worded ourselves; anything else (a dropped connection) is the browser's own
// text, which the participant never sees.
class ParticipantAccessError extends Error {}

function exchangeOnce(accessCode: string): Promise<ParticipantSessionContext> {
  const pending = exchangesInFlight.get(accessCode);
  if (pending) return pending;

  const request = fetch(participantAccessExchangeUrl(), {
    body: JSON.stringify({ accessCode }),
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal: timeoutSignal(),
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new ParticipantAccessError(createTranslator(getCurrentLanguage()).t('participant_access.link_invalid'));
      }
      return (await response.json()) as ParticipantSessionContext;
    })
    .catch((error: unknown) => {
      // Drop any failure, a refusal or a network blip, so a genuine retry can try again; a
      // successful exchange stays cached, because repeating it is what we are preventing.
      exchangesInFlight.delete(accessCode);
      throw error;
    });

  exchangesInFlight.set(accessCode, request);
  return request;
}

export function ParticipantAccessBootstrap({ children }: PropsWithChildren) {
  const location = useLocation();
  const accessCode = useMemo(() => participantAccessCodeFromFragment(location.hash), [location.hash]);
  const [state, setState] = useState<AccessState>({ status: 'loading' });
  // Bumped by the retry button; the code itself stays in memory because the address bar
  // no longer holds it.
  const [attempt, setAttempt] = useState(0);
  const { t } = useTranslator();

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger; bumping it re-runs the exchange.
  useEffect(() => {
    let cancelled = false;
    if (new URLSearchParams(location.search).has('accessCode')) removeAccessCodeFromAddressBar();
    const existing = readParticipantSessionContext();
    if (!accessCode) {
      setState(
        existing && contextMatchesLocation(existing, location.pathname, location.search)
          ? { context: existing, status: 'ready' }
          : { message: t('participant_access.missing_code'), retryable: false, status: 'error' },
      );
      return () => {
        cancelled = true;
      };
    }

    setState({ status: 'loading' });
    exchangeOnce(accessCode)
      .then((context) => {
        if (!contextMatchesLocation(context, location.pathname, location.search)) {
          throw new ParticipantAccessError(t('participant_access.link_mismatch'));
        }
        storeParticipantSessionContext(context);
        removeAccessCodeFromAddressBar();
        if (!cancelled) setState({ context, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const refused = error instanceof ParticipantAccessError;
          setState({
            message: refused ? error.message : t('participant_access.not_established'),
            retryable: !refused,
            status: 'error',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessCode, attempt, location.pathname, location.search, t]);

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
              <Button onClick={() => setAttempt((n) => n + 1)} variant="default">
                <RefreshCcw className="mr-2 h-4 w-4" />
                {t('common.try_again')}
              </Button>
            )
          }
          description={state.message}
          eyebrow={t('participant_access.eyebrow')}
          icon={<ShieldAlert className="h-5 w-5" />}
          title={t('participant_access.error_title')}
          tone="destructive"
        />
      </main>
    );
  }
  return children;
}
