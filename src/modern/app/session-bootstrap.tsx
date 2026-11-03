import { AlertTriangle, LoaderCircle, RefreshCcw } from 'lucide-react';
import { Activity, type PropsWithChildren, useEffect, useLayoutEffect, useState } from 'react';
import { StatePanel } from '@/components/state-panel';
import { Button } from '@/components/ui/button';
import { PortalContainerContext } from '@/components/ui/dialog';
import { useTranslator } from '@/i18n';
import { SESSION_LOGOUT_CHANNEL, SIGN_OUT_FAILED_MESSAGE } from '@/lib/auth-utils';
import {
  AUTH_SESSION_FAILED_PREFIX,
  AUTH_SESSION_NETWORK_FAILED_MESSAGE,
  TESTING_LOGIN_FAILED_PREFIX,
} from '@/lib/bootstrap-auth';
import { retainUnsavedEdits } from '@/lib/use-confirm-leave';
import { LoginPage } from '@/routes/login-page';
import {
  bootstrapSession,
  expireSession,
  logoutSession,
  recordUserActivity,
  SESSION_INIT_FAILED_MESSAGE,
  SESSION_STATUS,
  sessionDeadline,
  UNKNOWN_BOOTSTRAP_FAILURE_MESSAGE,
} from '@/state/session-slice';
import { type AppStore, type RootState, useAppSelector, useAppStore } from '@/state/store';
import { studyOperationsApi } from '@/state/study-operations-api';

// The session slice and the auth transport store their English fallback sentences (state
// stays serializable and language-agnostic); the shell renders the translated equivalent.
const WHOLE_MESSAGE_KEYS: Record<string, string> = {
  [AUTH_SESSION_NETWORK_FAILED_MESSAGE]: 'session.auth_network_failed',
  [SESSION_INIT_FAILED_MESSAGE]: 'session.init_failed',
  [UNKNOWN_BOOTSTRAP_FAILURE_MESSAGE]: 'session.unknown_bootstrap_failure',
};

const MAX_BROWSER_TIMEOUT_MS = 2 ** 31 - 1;

const STATUS_PREFIX_KEYS: ReadonlyArray<readonly [string, string]> = [
  [AUTH_SESSION_FAILED_PREFIX, 'session.auth_request_failed'],
  [TESTING_LOGIN_FAILED_PREFIX, 'session.testing_login_failed'],
];

function sessionErrorText(
  message: string | null,
  t: (key: string, options?: Record<string, string>) => string,
): string {
  if (message === null) return t('session.init_failed');
  const whole = WHOLE_MESSAGE_KEYS[message];
  if (whole) return t(whole);
  for (const [prefix, key] of STATUS_PREFIX_KEYS) {
    if (message.startsWith(prefix)) {
      return t(key, { status: message.slice(prefix.length).replace(/\.$/, '') });
    }
  }
  // Anything else is server-sent or already-translated copy; render it unchanged.
  return message;
}

function runBootstrap(store: AppStore): void {
  store
    .dispatch(bootstrapSession())
    .unwrap()
    .catch(() => {
      // The session slice owns the rejected state and renders its error panel.
    });
}

function useSessionDeadline(session: RootState['session']): void {
  const store = useAppStore();
  const expiresAt = sessionDeadline(session);
  useEffect(() => {
    if (session.status !== SESSION_STATUS.authenticated || expiresAt === null) return;
    let deadline: number | undefined;
    const checkExpiry = () => {
      window.clearTimeout(deadline);
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) store.dispatch(expireSession());
      else deadline = window.setTimeout(checkExpiry, Math.min(remaining, MAX_BROWSER_TIMEOUT_MS));
    };
    checkExpiry();
    // Recheck on resume too: background tabs may have their timers suspended.
    window.addEventListener('focus', checkExpiry);
    document.addEventListener('visibilitychange', checkExpiry);
    return () => {
      window.clearTimeout(deadline);
      window.removeEventListener('focus', checkExpiry);
      document.removeEventListener('visibilitychange', checkExpiry);
    };
  }, [store, session.status, expiresAt]);
}

function useUserActivity(status: RootState['session']['status']): void {
  const store = useAppStore();
  useEffect(() => {
    if (status !== SESSION_STATUS.authenticated) return;
    let inFlight = false;
    let queued = false;
    let active = true;
    let timer: number | undefined;
    const queueSignal = () => {
      if (queued) return;
      queued = true;
      // Let the same input's normal API call carry the signal first.
      queueMicrotask(() => {
        queued = false;
        window.clearTimeout(timer);
        const current = store.getState().session;
        if (
          !active ||
          inFlight ||
          current.pendingUserActivityAt === null ||
          current.status !== SESSION_STATUS.authenticated ||
          current.idleWindowMs === null
        )
          return;
        const due = Math.max(
          current.lastReportedActivityAt === null ? 0 : current.lastReportedActivityAt + current.idleWindowMs / 2,
          current.userActivityRetryAt ?? 0,
        );
        const remaining = due - performance.now();
        if (remaining > 0) {
          timer = window.setTimeout(queueSignal, Math.min(remaining, MAX_BROWSER_TIMEOUT_MS));
          return;
        }
        inFlight = true;
        const request = store.dispatch(studyOperationsApi.endpoints.refreshSessionActivity.initiate());
        void request
          .unwrap()
          .catch(() => undefined)
          .finally(() => {
            inFlight = false;
            request.reset();
            queueSignal();
          });
      });
    };
    const unsubscribe = store.subscribe(queueSignal);
    const record = (event: Event) => {
      if (event.isTrusted) store.dispatch(recordUserActivity(Date.now()));
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input', 'click'] as const;
    // React must read controlled inputs before a session render restores their value.
    for (const event of events) document.addEventListener(event, record, { passive: true });
    return () => {
      active = false;
      unsubscribe();
      window.clearTimeout(timer);
      for (const event of events) document.removeEventListener(event, record);
    };
  }, [store, status]);
}

function SessionViews({ children, session }: PropsWithChildren<{ session: RootState['session'] }>) {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const store = useAppStore();
  const { t } = useTranslator();
  const isLocked =
    session.status !== SESSION_STATUS.authenticated || (sessionDeadline(session) ?? Infinity) <= Date.now();
  const signOutFailed = session.errorMessage === SIGN_OUT_FAILED_MESSAGE;
  useSessionDeadline(session);
  useUserActivity(session.status);

  useLayoutEffect(() => {
    if (isLocked) return retainUnsavedEdits();
  }, [isLocked]);

  useEffect(() => {
    if (session.status !== SESSION_STATUS.locked && session.status !== SESSION_STATUS.signingOut) return;
    // Activity suspends query hooks. Keep their caches subscribed while signing in so
    // cache eviction cannot unmount an unsaved form when the hidden tree resumes.
    const subscriptions = Object.values(store.getState()[studyOperationsApi.reducerPath].queries).flatMap((query) => {
      if (!query?.endpointName) return [];
      const endpoint = studyOperationsApi.endpoints[query.endpointName as keyof typeof studyOperationsApi.endpoints];
      if (!('useQuery' in endpoint)) return [];
      const subscription = store.dispatch<ReturnType<ReturnType<typeof endpoint.initiate>>>(
        endpoint.initiate(query.originalArgs as never),
      );
      return [subscription];
    });
    return () => {
      for (const subscription of subscriptions) subscription.unsubscribe();
    };
  }, [store, session.status]);

  return (
    <>
      {/* Keep dialogs inside the hidden subtree as well. Preserve the container when Activity
          detaches refs; moving a portal back to body would expose it on the lock screen. */}
      <PortalContainerContext.Provider value={portalContainer}>
        <Activity key={session.user?.id ?? ''} mode={isLocked ? 'hidden' : 'visible'}>
          <div
            ref={(node) => {
              if (node) setPortalContainer(node);
            }}
          >
            {children}
          </div>
        </Activity>
      </PortalContainerContext.Provider>
      {isLocked && (
        <div>
          <p className="px-6 pt-6 text-center text-sm" role="alert">
            {session.status === SESSION_STATUS.signingOut
              ? t('session.signing_out')
              : signOutFailed
                ? t('session.sign_out_failed')
                : t('session.locked')}
          </p>
          {signOutFailed && (
            <div className="flex justify-center pt-3">
              <Button onClick={() => void store.dispatch(logoutSession())}>{t('session.retry_sign_out')}</Button>
            </div>
          )}
          {session.status !== SESSION_STATUS.signingOut && !signOutFailed && (
            <LoginPage loginUrl={session.loginUrl} providerLabel={session.providerLabel} />
          )}
        </div>
      )}
    </>
  );
}

export function SessionBootstrap({ children }: PropsWithChildren) {
  const session = useAppSelector((state) => state.session);
  const store = useAppStore();
  const { t } = useTranslator();

  useEffect(() => {
    const channel = new BroadcastChannel(SESSION_LOGOUT_CHANNEL);
    channel.onmessage = () => store.dispatch(expireSession());
    return () => channel.close();
  }, [store]);

  useEffect(() => {
    if (session.status === SESSION_STATUS.idle) {
      runBootstrap(store);
    }
  }, [store, session.status]);

  if (session.status === SESSION_STATUS.bootstrapping || session.status === SESSION_STATUS.idle) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <StatePanel
          description={t('session.bootstrapping_description')}
          eyebrow={t('session.eyebrow')}
          icon={<LoaderCircle className="h-5 w-5 animate-spin" />}
          title={t('session.bootstrapping_title')}
        />
      </main>
    );
  }

  if (session.status === SESSION_STATUS.error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <StatePanel
          actions={
            <Button
              onClick={() => {
                runBootstrap(store);
              }}
              variant="default"
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              {t('common.retry')}
            </Button>
          }
          description={sessionErrorText(session.errorMessage, t)}
          eyebrow={t('common.error')}
          icon={<AlertTriangle className="h-5 w-5" />}
          title={t('session.failed_title')}
          tone="destructive"
        />
      </main>
    );
  }

  // No session: render the login page *instead of* the dashboard, so no authenticated view
  // reaches an unauthenticated visitor.
  if (session.status === SESSION_STATUS.awaitingSso) {
    return <LoginPage loginUrl={session.loginUrl} providerLabel={session.providerLabel} />;
  }

  return <SessionViews session={session}>{children}</SessionViews>;
}

/**
 * The /login route sits outside SessionBootstrap so it renders without a session, but it still reads the
 * server's sign-in options: an SSO-only deployment has no dashboard password to offer.
 */
export function StandaloneLoginPage() {
  const session = useAppSelector((state) => state.session);
  const store = useAppStore();
  useEffect(() => {
    if (session.status === SESSION_STATUS.idle) runBootstrap(store);
  }, [store, session.status]);
  return <LoginPage loginUrl={session.loginUrl} providerLabel={session.providerLabel} redirectTo="/" />;
}
