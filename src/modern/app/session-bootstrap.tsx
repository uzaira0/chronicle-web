import { AlertTriangle, LoaderCircle, RefreshCcw } from 'lucide-react';
import { type PropsWithChildren, useEffect } from 'react';
import { StatePanel } from '@/components/state-panel';
import { Button } from '@/components/ui/button';
import { useTranslator } from '@/i18n';
import { AUTH_SESSION_FAILED_PREFIX, TESTING_LOGIN_FAILED_PREFIX } from '@/lib/bootstrap-auth';
import { LoginPage } from '@/routes/login-page';
import {
  bootstrapSession,
  SESSION_INIT_FAILED_MESSAGE,
  UNKNOWN_BOOTSTRAP_FAILURE_MESSAGE,
} from '@/state/session-slice';
import { store, useAppSelector } from '@/state/store';

// The session slice and the auth transport store their English fallback sentences (state
// stays serializable and language-agnostic); the shell renders the translated equivalent.
const WHOLE_MESSAGE_KEYS: Record<string, string> = {
  [SESSION_INIT_FAILED_MESSAGE]: 'session.init_failed',
  [UNKNOWN_BOOTSTRAP_FAILURE_MESSAGE]: 'session.unknown_bootstrap_failure',
};

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

function runBootstrap(): void {
  bootstrapSession()(store.dispatch, () => store.getState(), undefined)
    .unwrap()
    .catch(() => {
      // The session slice owns the rejected state and renders its error panel.
    });
}

export function SessionBootstrap({ children }: PropsWithChildren) {
  const session = useAppSelector((state) => state.session);
  const { t } = useTranslator();

  useEffect(() => {
    if (session.status === 'idle') {
      runBootstrap();
    }
  }, [session.status]);

  if (session.status === 'bootstrapping' || session.status === 'idle') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <StatePanel
          description={t('session.bootstrapping_description')}
          eyebrow={t('session.eyebrow')}
          icon={<LoaderCircle className="h-5 w-5 animate-spin" />}
          title={t('session.bootstrapping_title')}
        />
      </div>
    );
  }

  if (session.status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <StatePanel
          actions={
            <Button
              onClick={() => {
                runBootstrap();
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
      </div>
    );
  }

  // No session: render the login page *instead of* the dashboard. Rendering the dashboard
  // behind a banner used to expose every authenticated view to an unauthenticated visitor.
  if (session.status === 'awaiting-sso') {
    return <LoginPage loginUrl={session.loginUrl} providerLabel={session.providerLabel} />;
  }

  return children;
}
