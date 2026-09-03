import { ShieldCheck, Smartphone } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createTranslator, getCurrentLanguage, isRtlLanguage, LanguageSwitcher, useTranslator } from '@/i18n';
import { getDefaultEnrollmentServerUrl, normalizePublicServerUrl } from '@/lib/participant-links';
import {
  ANDROID_PLAY_STORE_URL,
  type EnrollmentPreview,
  enrollmentInvitationFromPreview,
  formatEnrollmentExpiry,
  getAndroidEnrollmentHandoffUrl,
  validateEnrollmentPreview,
} from '@/routes/public-enrollment-page';

type ReviewerPageState =
  | { kind: 'entry' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { handoffUrl: string; kind: 'verified'; preview: EnrollmentPreview };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameOriginPublicServer(): string {
  const configuredServer = getDefaultEnrollmentServerUrl();
  // The configured server is the authority. Permitting a private host for this normalization
  // only lets the explicitly enabled local HTTPS trial compare its current page to that exact
  // configured origin; it cannot redirect reviewer enrollment to a different host.
  const pageOrigin = normalizePublicServerUrl(window.location.origin, { allowPrivateHost: true });
  if (!pageOrigin || pageOrigin !== configuredServer) {
    throw new Error(createTranslator(getCurrentLanguage()).t('reviewer.error_wrong_server_detail'));
  }
  return configuredServer;
}

export function ReviewerEnrollmentPage() {
  const [secret, setSecret] = useState('');
  const [state, setState] = useState<ReviewerPageState>({ kind: 'entry' });
  const submissionInFlight = useRef(false);
  const { effectiveCode, t } = useTranslator();

  async function submitSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (secret.length < 32 || submissionInFlight.current) return;

    let publicServerUrl: string;
    try {
      publicServerUrl = sameOriginPublicServer();
    } catch {
      setState({ kind: 'error', message: t('reviewer.error_wrong_server') });
      return;
    }

    submissionInFlight.current = true;
    const submittedSecret = secret;
    // The reusable reviewer secret exists only in component memory and this request header.
    // Clear the input state before any network response or rendering can retain it.
    setSecret('');
    setState({ kind: 'loading' });

    try {
      const response = await fetch('/chronicle/v4/mobile/reviewer-enrollment', {
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          'X-Chronicle-Reviewer-Secret': submittedSecret,
        },
        method: 'POST',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      });
      // swallowed by the catch below, which renders t('reviewer.error_unverified')
      // ast-grep-ignore: web-i18n-error-message
      if (!response.ok) throw new Error('Reviewer enrollment request failed');
      const payload: unknown = await response.json();
      // swallowed by the catch below, which renders t('reviewer.error_unverified')
      // ast-grep-ignore: web-i18n-error-message
      if (!isRecord(payload)) throw new Error('Reviewer enrollment response was malformed');

      const invitation = enrollmentInvitationFromPreview(payload.preview, payload.enrollmentCode);
      const preview = validateEnrollmentPreview(payload.preview, invitation, publicServerUrl);
      setState({
        handoffUrl: getAndroidEnrollmentHandoffUrl(invitation, publicServerUrl),
        kind: 'verified',
        preview,
      });
    } catch {
      setState({
        kind: 'error',
        message: t('reviewer.error_unverified'),
      });
    } finally {
      submissionInFlight.current = false;
    }
  }

  return (
    <main
      className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8"
      dir={isRtlLanguage(effectiveCode) ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="border-b border-border pb-8">
          <div className="mb-4 flex items-center justify-between gap-3 text-sm font-medium text-muted-foreground">
            <span className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {t('reviewer.eyebrow')}
            </span>
            <LanguageSwitcher />
          </div>
          <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">{t('reviewer.title')}</h1>
          <p className="mt-4 max-w-xl leading-7 text-muted-foreground">{t('reviewer.intro')}</p>
        </header>

        {(state.kind === 'entry' || state.kind === 'error') && (
          <form
            className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
            onSubmit={(event) => {
              void submitSecret(event);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="reviewer-secret">{t('reviewer.secret_label')}</Label>
              <Input
                autoComplete="off"
                id="reviewer-secret"
                onChange={(event) => setSecret(event.target.value)}
                required
                spellCheck={false}
                type="password"
                value={secret}
              />
              <p className="text-xs leading-5 text-muted-foreground">{t('reviewer.secret_note')}</p>
            </div>
            {state.kind === 'error' && (
              <p aria-live="polite" className="text-sm font-medium text-destructive">
                {state.message}
              </p>
            )}
            <Button disabled={secret.length < 32} type="submit">
              {t('reviewer.verify')}
            </Button>
          </form>
        )}

        {state.kind === 'loading' && (
          <p aria-live="polite" className="rounded-xl border border-border bg-card p-6 text-muted-foreground">
            {t('reviewer.requesting')}
          </p>
        )}

        {state.kind === 'verified' && (
          <>
            <section className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <ShieldCheck className="h-5 w-5" />
                {t('enrollment.verified_response')}
              </div>
              <h2 className="text-2xl font-semibold">{state.preview.studyTitle}</h2>
              <p className="leading-7 text-muted-foreground">{state.preview.studyDescription}</p>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('enrollment.responsible_institution')}
                  </dt>
                  <dd className="mt-1">{state.preview.participantPolicy.responsibleInstitution}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('enrollment.server_operator')}
                  </dt>
                  <dd className="mt-1">{state.preview.participantPolicy.serverOperator}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('enrollment.purpose')}
                  </dt>
                  <dd className="mt-1">{state.preview.participantPolicy.purpose}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('reviewer.one_time_expires')}
                  </dt>
                  <dd className="mt-1">
                    <time dateTime={state.preview.expiresAt}>{formatEnrollmentExpiry(state.preview.expiresAt)}</time>
                  </dd>
                </div>
              </dl>
            </section>

            <section className="space-y-4 rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <Smartphone className="h-6 w-6 text-primary" />
                <h2 className="text-xl font-semibold">{t('enrollment.continue_title')}</h2>
              </div>
              <p className="leading-7 text-muted-foreground">{t('reviewer.continue_body')}</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button asChild size="lg">
                  <a href={state.handoffUrl}>{t('enrollment.open_android')}</a>
                </Button>
                <a
                  className="text-sm text-primary underline"
                  href={ANDROID_PLAY_STORE_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t('enrollment.get_on_play')}
                </a>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{t('reviewer.play_fallback_note')}</p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
