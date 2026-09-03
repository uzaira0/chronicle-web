import { Building2, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslator } from '@/i18n';
import {
  DASHBOARD_LOGIN_RATE_LIMITED_MESSAGE,
  DASHBOARD_LOGIN_REJECTED_MESSAGE,
  DASHBOARD_LOGIN_UNAVAILABLE_MESSAGE,
} from '@/lib/bootstrap-auth';
import { DASHBOARD_SIGN_IN_FAILED_MESSAGE, loginWithPassword } from '@/state/session-slice';
import { store } from '@/state/store';

type LoginPageProps = {
  /** SSO entry point, when the backend advertises one. Rendered as a secondary affordance. */
  loginUrl?: string | null;
  providerLabel?: string;
  /** Where to go once the password is accepted. Omitted when the page is rendered in place
   *  of the dashboard by `SessionBootstrap` — there the session status change is the
   *  transition, and navigating would throw the user off the route they asked for. */
  redirectTo?: string;
};

// bootstrap-auth raises fixed English sentences (its tests read them verbatim); translate the
// known ones here and pass anything else through.
const LOGIN_FAILURE_KEYS: Record<string, string> = {
  [DASHBOARD_LOGIN_REJECTED_MESSAGE]: 'login.password_rejected',
  [DASHBOARD_LOGIN_RATE_LIMITED_MESSAGE]: 'login.rate_limited',
  [DASHBOARD_LOGIN_UNAVAILABLE_MESSAGE]: 'login.unavailable',
  [DASHBOARD_SIGN_IN_FAILED_MESSAGE]: 'login.unknown_failure',
};

function loginFailureMessage(cause: string, t: (key: string) => string): string {
  const key = LOGIN_FAILURE_KEYS[cause];
  return key ? t(key) : cause;
}

export function LoginPage({ loginUrl = null, providerLabel, redirectTo }: LoginPageProps) {
  const navigate = useNavigate();
  const { t } = useTranslator();
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // The submit button is disabled while a request is open, but a second Enter keypress can
    // still land between the click and the re-render, and every attempt counts against the
    // backend rate limit.
    if (isSubmitting) return;

    if (password.length === 0) {
      setErrorMessage(t('login.empty_password'));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await store.dispatch(loginWithPassword(password)).unwrap();
      setPassword('');
      setIsSubmitting(false);
      if (redirectTo) void navigate(redirectTo, { replace: true });
    } catch (cause) {
      setIsSubmitting(false);
      setErrorMessage(
        typeof cause === 'string' && cause.length > 0 ? loginFailureMessage(cause, t) : t('login.unknown_failure'),
      );
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.24em]">Chronicle</span>
          </div>
          <CardTitle>{t('login.title')}</CardTitle>
          <CardDescription>{t('login.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="dashboard-password" required>
                {t('login.password_label')}
              </Label>
              <Input
                autoComplete="current-password"
                id="dashboard-password"
                name="password"
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                placeholder="••••••••"
                type="password"
                value={password}
              />
            </div>

            {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <>
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  {t('login.signing_in')}
                </>
              ) : (
                <>
                  <LockKeyhole className="mr-2 h-4 w-4" />
                  {t('login.sign_in')}
                </>
              )}
            </Button>

            {loginUrl && (
              <Button asChild variant="outline">
                <a href={loginUrl}>
                  <Building2 className="mr-2 h-4 w-4" />
                  {t('login.continue_with', {
                    provider:
                      providerLabel && providerLabel !== 'Institutional SSO'
                        ? providerLabel
                        : t('login.default_provider'),
                  })}
                </a>
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
