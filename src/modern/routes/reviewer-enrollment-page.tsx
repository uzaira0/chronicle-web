import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { EnrollmentDetails, EnrollmentHandoff } from '@/components/enrollment-details';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { REVIEWER_SECRET_HEADER } from '@/generated/chronicle-contracts';
import { isRtlLanguage, LanguageSwitcher, useTranslator } from '@/i18n';
import {
  type EnrollmentPreview,
  enrollmentInvitationFromPreview,
  enrollmentRequestErrorKey,
  enrollmentTranslator,
  getAndroidEnrollmentHandoffUrl,
  validateEnrollmentPreview,
} from '@/lib/enrollment-preview';
import { isRetryableHttpStatus } from '@/lib/errors';
import { getDefaultEnrollmentServerUrl, normalizePublicServerUrl } from '@/lib/participant-links';
import { timeoutSignal } from '@/lib/request-timeout';

type ReviewerPageState =
  | { kind: 'entry' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; retryable?: boolean }
  | { handoffUrl: string; kind: 'verified'; preview: EnrollmentPreview };

function sameOriginPublicServer(): string {
  const configuredServer = getDefaultEnrollmentServerUrl();
  // The configured server is the authority. Permitting a private host for this normalization
  // only lets the explicitly enabled local HTTPS trial compare its current page to that exact
  // configured origin; it cannot redirect reviewer enrollment to a different host.
  const pageOrigin = normalizePublicServerUrl(window.location.origin, { allowPrivateHost: true });
  if (!pageOrigin || pageOrigin !== configuredServer) {
    throw new Error(enrollmentTranslator().t('reviewer.error_wrong_server_detail'));
  }
  return configuredServer;
}

export function ReviewerEnrollmentPage() {
  const [secret, setSecret] = useState('');
  const [invalidSecret, setInvalidSecret] = useState(false);
  const secretInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ReviewerPageState>({ kind: 'entry' });
  const submissionInFlight = useRef(false);
  const retrySecret = useRef<string | null>(null);
  const { effectiveCode, t } = useTranslator();

  async function submitSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedSecret = secret || retrySecret.current || '';
    if (submissionInFlight.current) return;
    if (submittedSecret.length < 32) {
      setInvalidSecret(true);
      secretInput.current?.focus();
      return;
    }
    setInvalidSecret(false);

    let publicServerUrl: string;
    try {
      publicServerUrl = sameOriginPublicServer();
    } catch {
      setState({ kind: 'error', message: t('reviewer.error_wrong_server') });
      return;
    }

    submissionInFlight.current = true;
    // The reusable reviewer secret exists only in component memory and this request header.
    // Clear the input state before any network response or rendering can retain it.
    setSecret('');
    retrySecret.current = null;
    setState({ kind: 'loading' });

    let errorKey = 'reviewer.error_network';
    let retryable = true;
    try {
      const response = await fetch('/chronicle/v4/mobile/reviewer-enrollment', {
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          [REVIEWER_SECRET_HEADER]: submittedSecret,
        },
        method: 'POST',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: timeoutSignal(),
      });
      if (!response.ok) {
        retryable = isRetryableHttpStatus(response.status);
        errorKey = enrollmentRequestErrorKey(response.status, true);
        throw new Error(t(errorKey));
      }
      errorKey = 'reviewer.error_response';
      const payload = (await response.json()) as { enrollmentCode?: unknown; preview?: unknown } | null;
      retryable = false;

      errorKey = 'reviewer.error_disclosure';
      const invitation = enrollmentInvitationFromPreview(payload?.preview, payload?.enrollmentCode);
      const preview = validateEnrollmentPreview(payload?.preview, invitation, publicServerUrl);
      setState({
        handoffUrl: getAndroidEnrollmentHandoffUrl(invitation, publicServerUrl),
        kind: 'verified',
        preview,
      });
    } catch {
      retrySecret.current = retryable ? submittedSecret : null;
      setState({
        kind: 'error',
        message: t(errorKey),
        retryable,
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
            noValidate
            className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
            onSubmit={(event) => {
              void submitSecret(event);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="reviewer-secret">{t('reviewer.secret_label')}</Label>
              <Input
                aria-describedby={invalidSecret ? 'reviewer-secret-error' : undefined}
                aria-invalid={invalidSecret}
                ref={secretInput}
                autoComplete="off"
                id="reviewer-secret"
                name="reviewer-secret"
                onChange={(event) => {
                  setSecret(event.target.value);
                  setInvalidSecret(false);
                }}
                required={!retrySecret.current}
                spellCheck={false}
                type="password"
                value={secret}
              />
              <p className="text-xs leading-5 text-muted-foreground">{t('reviewer.secret_note')}</p>
            </div>
            {invalidSecret && (
              <p id="reviewer-secret-error" role="alert" className="text-sm text-destructive">
                {t('reviewer.error_secret_length')}
              </p>
            )}
            {state.kind === 'error' && (
              <p aria-live="polite" className="text-sm font-medium text-destructive">
                {state.message}
              </p>
            )}
            <Button type="submit">
              {t(state.kind === 'error' && state.retryable ? 'common.try_again' : 'reviewer.verify')}
            </Button>
          </form>
        )}

        {state.kind === 'loading' && (
          <p
            aria-live="polite"
            className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-muted-foreground"
          >
            <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
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
              <EnrollmentDetails
                preview={state.preview}
                contactLabel={t('enrollment.purpose')}
                contactValue={state.preview.participantPolicy.purpose}
                expiryLabel={t('reviewer.one_time_expires')}
              />
            </section>

            <EnrollmentHandoff
              handoffUrl={state.handoffUrl}
              continueBody={t('reviewer.continue_body')}
              playFallbackNote={t('reviewer.play_fallback_note')}
            />
          </>
        )}
      </div>
    </main>
  );
}
