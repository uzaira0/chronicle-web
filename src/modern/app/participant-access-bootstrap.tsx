import { LoaderCircle, ShieldAlert } from 'lucide-react';
import { type PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';

import { StatePanel } from '@/components/state-panel';
import { createTranslator, getCurrentLanguage, useTranslator } from '@/i18n';
import {
  type ParticipantFormKind,
  type ParticipantSessionContext,
  participantAccessCodeFromFragment,
  participantAccessExchangeUrl,
  readParticipantSessionContext,
  storeParticipantSessionContext,
} from '@/lib/participant-access';

type AccessState =
  | { context: ParticipantSessionContext; status: 'ready' }
  | { message: string; status: 'error' }
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

function exchangeOnce(accessCode: string): Promise<ParticipantSessionContext> {
  const pending = exchangesInFlight.get(accessCode);
  if (pending) return pending;

  const request = fetch(participantAccessExchangeUrl(), {
    body: JSON.stringify({ accessCode }),
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  }).then(async (response) => {
    if (!response.ok) {
      // Drop the failure so a genuine retry (a new mount after a network blip) can try
      // again; a successful exchange stays cached, because repeating it is what we are
      // preventing.
      exchangesInFlight.delete(accessCode);
      throw new Error(createTranslator(getCurrentLanguage()).t('participant_access.link_invalid'));
    }
    return (await response.json()) as ParticipantSessionContext;
  });

  exchangesInFlight.set(accessCode, request);
  return request;
}

export function ParticipantAccessBootstrap({ children }: PropsWithChildren) {
  const location = useLocation();
  const accessCode = useMemo(() => participantAccessCodeFromFragment(location.hash), [location.hash]);
  const [state, setState] = useState<AccessState>({ status: 'loading' });
  const { t } = useTranslator();

  useEffect(() => {
    let cancelled = false;
    if (new URLSearchParams(location.search).has('accessCode')) removeAccessCodeFromAddressBar();
    const existing = readParticipantSessionContext();
    if (!accessCode) {
      setState(
        existing && contextMatchesLocation(existing, location.pathname, location.search)
          ? { context: existing, status: 'ready' }
          : { message: t('participant_access.missing_code'), status: 'error' },
      );
      return () => {
        cancelled = true;
      };
    }

    setState({ status: 'loading' });
    exchangeOnce(accessCode)
      .then((context) => {
        if (!contextMatchesLocation(context, location.pathname, location.search)) {
          throw new Error(t('participant_access.link_mismatch'));
        }
        storeParticipantSessionContext(context);
        removeAccessCodeFromAddressBar();
        if (!cancelled) setState({ context, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            message: error instanceof Error ? error.message : t('participant_access.not_established'),
            status: 'error',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessCode, location.pathname, location.search, t]);

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
