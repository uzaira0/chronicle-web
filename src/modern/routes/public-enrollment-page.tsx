import { ExternalLink, Server, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

import { EnrollmentDetails, EnrollmentHandoff } from '@/components/enrollment-details';
import { isRtlLanguage, LanguageSwitcher, useTranslator } from '@/i18n';
import {
  type EnrollmentInvitation,
  type EnrollmentPreview,
  enrollmentTranslator,
  getAndroidEnrollmentHandoffUrl,
  invitationFromAddress,
  validateEnrollmentPreview,
} from '@/lib/enrollment-preview';
import { getDefaultEnrollmentServerUrl } from '@/lib/participant-links';
import { REQUEST_TIMEOUT_MS } from '@/lib/request-timeout';

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { handoffUrl: string; kind: 'verified'; preview: EnrollmentPreview };

export function PublicEnrollmentPage() {
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const { effectiveCode, t } = useTranslator();

  useEffect(() => {
    let invitation: EnrollmentInvitation;
    try {
      invitation = invitationFromAddress();
    } catch (error: unknown) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : enrollmentTranslator().t('enrollment.error_invalid'),
      });
      return;
    }

    // Retain the credential in memory for the Android handoff, but remove it from the visible
    // address after parsing. URL fragments are never sent in the page request.
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);

    let publicServerUrl: string;
    try {
      publicServerUrl = getDefaultEnrollmentServerUrl();
    } catch {
      setState({ kind: 'error', message: enrollmentTranslator().t('enrollment.error_no_server') });
      return;
    }

    const controller = new AbortController();
    // Unmount cancels quietly (AbortError); a hung server ends in the unverified error instead.
    const timer = setTimeout(
      () => controller.abort(new DOMException('The request timed out.', 'TimeoutError')),
      REQUEST_TIMEOUT_MS,
    );
    const previewUrl =
      `${publicServerUrl}/chronicle/v4/study/${encodeURIComponent(invitation.studyId)}` +
      `/participant/${encodeURIComponent(invitation.participantId)}/enrollment-preview`;

    fetch(previewUrl, {
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        'X-Chronicle-Enrollment-Code': invitation.accessCode,
      },
      method: 'GET',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(enrollmentTranslator().t('enrollment.preview_request_failed'));
        const payload: unknown = await response.json();
        return validateEnrollmentPreview(payload, invitation, publicServerUrl);
      })
      .then((preview) => {
        setState({
          handoffUrl: getAndroidEnrollmentHandoffUrl(invitation, publicServerUrl),
          kind: 'verified',
          preview,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          kind: 'error',
          message: enrollmentTranslator().t('enrollment.error_unverified'),
        });
      });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return (
    <main
      className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8"
      dir={isRtlLanguage(effectiveCode) ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="border-b border-border pb-8">
          <div className="mb-4 flex items-center justify-between gap-3 text-sm font-medium text-muted-foreground">
            <span className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {t('enrollment.eyebrow')}
            </span>
            <LanguageSwitcher />
          </div>
          <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">{t('enrollment.title')}</h1>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{t('enrollment.intro')}</p>
        </header>

        {state.kind === 'loading' && (
          <p aria-live="polite" className="rounded-lg border border-border bg-card p-5 text-muted-foreground">
            {t('enrollment.verifying')}
          </p>
        )}

        {state.kind === 'error' && (
          <section aria-live="polite" className="rounded-lg border border-destructive/40 bg-card p-5">
            <h2 className="font-semibold">{t('enrollment.unavailable_title')}</h2>
            <p className="mt-2 leading-7 text-muted-foreground">{state.message}</p>
          </section>
        )}

        {state.kind === 'verified' && (
          <>
            <section className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <ShieldCheck className="h-5 w-5" />
                {t('enrollment.verified_response')}
              </div>
              <div>
                <h2 className="text-2xl font-semibold">{state.preview.studyTitle}</h2>
                <p className="mt-2 leading-7 text-muted-foreground">{state.preview.studyDescription}</p>
              </div>
              <EnrollmentDetails
                preview={state.preview}
                contactLabel={t('enrollment.research_contact')}
                contactValue={state.preview.participantPolicy.researchContact}
                expiryLabel={t('enrollment.invitation_expires')}
              />
              <div className="rounded-lg bg-muted p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Server className="h-4 w-4" />
                  {t('enrollment.study_server')}
                </div>
                <code className="mt-2 block overflow-x-auto text-xs">{state.preview.serverOrigin}</code>
              </div>
            </section>

            <section className="space-y-5 rounded-xl border border-border bg-card p-6">
              <h2 className="text-xl font-semibold">{t('enrollment.disclosure')}</h2>
              <div>
                <h3 className="font-semibold">{t('enrollment.purpose')}</h3>
                <p className="mt-1 leading-7 text-muted-foreground">{state.preview.participantPolicy.purpose}</p>
              </div>
              <div>
                <h3 className="font-semibold">{t('enrollment.procedures')}</h3>
                <p className="mt-1 leading-7 text-muted-foreground">{state.preview.participantPolicy.procedures}</p>
              </div>
              <div>
                <h3 className="font-semibold">{t('enrollment.expected_duration')}</h3>
                <p className="mt-1 leading-7 text-muted-foreground">
                  {state.preview.participantPolicy.expectedDuration}
                </p>
              </div>
              <div>
                <h3 className="font-semibold">{t('enrollment.foreseeable_risks')}</h3>
                <p className="mt-1 leading-7 text-muted-foreground">
                  {state.preview.participantPolicy.foreseeableRisks}
                </p>
              </div>
              <div>
                <h3 className="font-semibold">{t('enrollment.expected_benefits')}</h3>
                <p className="mt-1 leading-7 text-muted-foreground">
                  {state.preview.participantPolicy.expectedBenefits}
                </p>
              </div>
              <div>
                <h3 className="font-semibold">{t('enrollment.data_use_and_sharing')}</h3>
                <p className="mt-1 leading-7 text-muted-foreground">
                  {state.preview.participantPolicy.dataUseAndSharing}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t('enrollment.platform_always_records')}
                </p>
              </div>
              <div>
                <h3 className="font-semibold">{t('enrollment.retention_and_deletion')}</h3>
                <p className="mt-1 leading-7 text-muted-foreground">
                  {state.preview.participantPolicy.retentionAndDeletion}
                </p>
                <p className="mt-1 leading-7 text-muted-foreground">
                  {t(
                    state.preview.withdrawalMode === 'ERASE'
                      ? 'enrollment.withdrawal_erases'
                      : 'enrollment.withdrawal_keeps',
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <a
                  className="inline-flex items-center gap-1 text-primary underline"
                  href={state.preview.participantPolicy.privacyPolicyUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t('enrollment.privacy_policy_link')} <ExternalLink className="h-4 w-4" />
                </a>
                <a
                  className="inline-flex items-center gap-1 text-primary underline"
                  href={state.preview.participantPolicy.withdrawalUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t('enrollment.withdrawal_link')} <ExternalLink className="h-4 w-4" />
                </a>
                {state.preview.participantPolicy.consentDocumentUrl && (
                  <a
                    className="inline-flex items-center gap-1 text-primary underline"
                    href={state.preview.participantPolicy.consentDocumentUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t('enrollment.consent_document_link')} <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </section>

            <EnrollmentHandoff
              handoffUrl={state.handoffUrl}
              continueBody={t('enrollment.continue_body')}
              playFallbackNote={t('enrollment.play_fallback_note')}
            />
          </>
        )}
      </div>
    </main>
  );
}
