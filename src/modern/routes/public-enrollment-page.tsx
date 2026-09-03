import { ExternalLink, Server, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { createTranslator, getCurrentLanguage, isRtlLanguage, LanguageSwitcher, useTranslator } from '@/i18n';
import {
  getDefaultEnrollmentServerUrl,
  isValidParticipantAccessCode,
  normalizePublicServerUrl,
} from '@/lib/participant-links';
import { isRfc3339OffsetDateTime } from '@/lib/participant-policy';

const ANDROID_PACKAGE = 'com.bcm.chronicle';
export const ANDROID_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EnrollmentInvitation = {
  accessCode: string;
  participantId: string;
  studyId: string;
};

type ParticipantPolicy = {
  consentDocumentUrl: string | null;
  dataUseAndSharing: string;
  expectedBenefits: string;
  expectedDuration: string;
  foreseeableRisks: string;
  privacyPolicyUrl: string;
  procedures: string;
  purpose: string;
  researchContact: string;
  responsibleInstitution: string;
  retentionAndDeletion: string;
  serverOperator: string;
  version: string;
  withdrawalUrl: string;
};

export type EnrollmentPreview = {
  expiresAt: string;
  participantPolicy: ParticipantPolicy;
  serverOrigin: string;
  studyDescription: string;
  studyTitle: string;
};

// Error messages are produced outside React; the page renders them in the active language
// through the translator at display time when they are keys, and verbatim otherwise.
// Errors are raised outside render (URL parsing, manifest validation) and shown verbatim on the
// page, so they resolve against the participant's current language rather than a fixed table.
const current = () => createTranslator(getCurrentLanguage());
const fail = (key: string) => new Error(current().t(key));

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { handoffUrl: string; kind: 'verified'; preview: EnrollmentPreview };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, maximumLength = 8_000): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim() || value.length > maximumLength) throw new Error(`Invalid ${key}`);
  return value.trim();
}

function optionalText(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new Error(`Invalid ${key}`);
  return value.trim();
}

function httpsDocumentUrl(value: unknown, optional = false): string | null {
  if (optional && (value === null || value === undefined || value === '')) return null;
  if (typeof value !== 'string' || value.length > 2_048) throw fail('enrollment.invalid_policy_url');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw fail('enrollment.invalid_policy_url');
  }
  return parsed.href;
}

function invitationFromAddress(): EnrollmentInvitation {
  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (query.has('accessCode')) throw new Error(current().t('enrollment.error_credential_in_query'));

  const studyId = query.get('studyId')?.trim() ?? '';
  const participantId = query.get('participantId')?.trim() ?? '';
  const accessCode = fragment.get('accessCode') ?? '';
  if (
    !UUID_PATTERN.test(studyId) ||
    !participantId ||
    participantId.length > 256 ||
    !isValidParticipantAccessCode(accessCode)
  ) {
    throw new Error(current().t('enrollment.error_incomplete'));
  }
  return { accessCode, participantId, studyId: studyId.toLowerCase() };
}

function validateManifestTimes(manifest: Record<string, unknown>): string {
  const expiresAt = requiredString(manifest, 'expiresAt');
  const issuedAt = requiredString(manifest, 'issuedAt');
  const issuedAtMillis = Date.parse(issuedAt);
  const expiresAtMillis = Date.parse(expiresAt);
  if (
    !isRfc3339OffsetDateTime(issuedAt) ||
    !isRfc3339OffsetDateTime(expiresAt) ||
    !Number.isFinite(issuedAtMillis) ||
    !Number.isFinite(expiresAtMillis) ||
    expiresAtMillis <= issuedAtMillis ||
    expiresAtMillis <= Date.now()
  ) {
    throw fail('enrollment.preview_expired');
  }
  return expiresAt;
}

function validateCollectionSettings(manifest: Record<string, unknown>): void {
  if (!isRecord(manifest.collectionSettings)) throw fail('enrollment.invalid_collection_settings');
  const manifestSettingsVersion = manifest.settingsVersion;
  const collectionSettingsVersion = manifest.collectionSettings.settingsVersion;
  if (
    !Number.isInteger(manifestSettingsVersion) ||
    !Number.isInteger(collectionSettingsVersion) ||
    (manifestSettingsVersion as number) <= 0 ||
    manifestSettingsVersion !== collectionSettingsVersion
  ) {
    throw fail('enrollment.invalid_collection_settings_version');
  }
}

function validateManifestIdentity(
  manifest: Record<string, unknown>,
  invitation: EnrollmentInvitation,
  expectedServerOrigin: string,
): void {
  // `expectedServerOrigin` already came from the deployment's validated runtime config.
  // Allow a LAN address while normalizing the signed manifest only so the supported local
  // HTTPS trial can compare equal; an unexpected private origin still fails the exact match.
  const serverOrigin = normalizePublicServerUrl(manifest.serverOrigin, { allowPrivateHost: true });
  if (
    requiredString(manifest, 'studyId').toLowerCase() !== invitation.studyId ||
    requiredString(manifest, 'participantId') !== invitation.participantId ||
    serverOrigin !== expectedServerOrigin
  ) {
    throw fail('enrollment.preview_mismatch');
  }
}

export function validateEnrollmentPreview(
  payload: unknown,
  invitation: EnrollmentInvitation,
  expectedServerOrigin: string,
): EnrollmentPreview {
  if (!isRecord(payload) || !isRecord(payload.manifest)) throw fail('enrollment.invalid_preview');
  const manifest = payload.manifest;
  const digest = payload.manifestDigest;
  if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) throw fail('enrollment.invalid_manifest_digest');
  if (manifest.schemaVersion !== 1) throw fail('enrollment.unsupported_preview');

  validateManifestIdentity(manifest, invitation, expectedServerOrigin);
  const expiresAt = validateManifestTimes(manifest);
  validateCollectionSettings(manifest);

  if (!isRecord(manifest.participantPolicy)) throw fail('enrollment.invalid_participant_policy');
  const policy = manifest.participantPolicy;
  const effectiveAt = requiredString(policy, 'effectiveAt');
  if (!isRfc3339OffsetDateTime(effectiveAt)) throw fail('enrollment.invalid_policy_effective_date');
  return {
    expiresAt,
    participantPolicy: {
      consentDocumentUrl: httpsDocumentUrl(policy.consentDocumentUrl, true),
      dataUseAndSharing: requiredString(policy, 'dataUseAndSharing'),
      expectedBenefits: requiredString(policy, 'expectedBenefits'),
      expectedDuration: requiredString(policy, 'expectedDuration'),
      foreseeableRisks: requiredString(policy, 'foreseeableRisks'),
      privacyPolicyUrl: httpsDocumentUrl(policy.privacyPolicyUrl) ?? '',
      procedures: requiredString(policy, 'procedures'),
      purpose: requiredString(policy, 'purpose'),
      researchContact: requiredString(policy, 'researchContact'),
      responsibleInstitution: requiredString(policy, 'responsibleInstitution'),
      retentionAndDeletion: requiredString(policy, 'retentionAndDeletion'),
      serverOperator: requiredString(policy, 'serverOperator'),
      version: requiredString(policy, 'version', 128),
      withdrawalUrl: httpsDocumentUrl(policy.withdrawalUrl) ?? '',
    },
    serverOrigin: expectedServerOrigin,
    studyDescription: optionalText(manifest, 'studyDescription') || current().t('enrollment.no_short_description'),
    studyTitle: requiredString(manifest, 'studyTitle'),
  };
}

export function getAndroidEnrollmentHandoffUrl(invitation: EnrollmentInvitation, serverUrl: string): string {
  const query = new URLSearchParams({
    studyId: invitation.studyId,
    participantId: invitation.participantId,
    serverUrl,
  });
  const credentialFragment = new URLSearchParams({ accessCode: invitation.accessCode });
  const fallback = encodeURIComponent(ANDROID_PLAY_STORE_URL);
  return (
    `intent://enroll?${query.toString()}#${credentialFragment.toString()}` +
    `#Intent;scheme=chronicle;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`
  );
}

export function enrollmentInvitationFromPreview(payload: unknown, accessCode: unknown): EnrollmentInvitation {
  if (!isValidParticipantAccessCode(accessCode) || !isRecord(payload) || !isRecord(payload.manifest)) {
    throw fail('enrollment.invalid_reviewer_response');
  }
  const studyId = requiredString(payload.manifest, 'studyId').toLowerCase();
  const participantId = requiredString(payload.manifest, 'participantId', 256);
  if (!UUID_PATTERN.test(studyId)) throw fail('enrollment.invalid_reviewer_study');
  return { accessCode, participantId, studyId };
}

export function formatEnrollmentExpiry(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

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
        message: error instanceof Error ? error.message : current().t('enrollment.error_invalid'),
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
      setState({ kind: 'error', message: current().t('enrollment.error_no_server') });
      return;
    }

    const controller = new AbortController();
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
        if (!response.ok) throw fail('enrollment.preview_request_failed');
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
          message: current().t('enrollment.error_unverified'),
        });
      });

    return () => controller.abort();
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
                    {t('enrollment.research_contact')}
                  </dt>
                  <dd className="mt-1">{state.preview.participantPolicy.researchContact}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('enrollment.invitation_expires')}
                  </dt>
                  <dd className="mt-1">
                    <time dateTime={state.preview.expiresAt}>{formatEnrollmentExpiry(state.preview.expiresAt)}</time>
                  </dd>
                </div>
              </dl>
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
              </div>
              <div>
                <h3 className="font-semibold">{t('enrollment.retention_and_deletion')}</h3>
                <p className="mt-1 leading-7 text-muted-foreground">
                  {state.preview.participantPolicy.retentionAndDeletion}
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

            <section className="space-y-4 rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <Smartphone className="h-6 w-6 text-primary" />
                <h2 className="text-xl font-semibold">{t('enrollment.continue_title')}</h2>
              </div>
              <p className="leading-7 text-muted-foreground">{t('enrollment.continue_body')}</p>
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
              <p className="text-xs leading-5 text-muted-foreground">{t('enrollment.play_fallback_note')}</p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
