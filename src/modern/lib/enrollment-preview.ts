import { createTranslator, getCurrentLanguage } from '@/i18n';
import { isValidParticipantAccessCode, normalizePublicServerUrl } from '@/lib/participant-links';
import { isRfc3339OffsetDateTime } from '@/lib/participant-policy';
import { WITHDRAWAL_MODES, type WithdrawalMode } from '@/lib/study-constants';

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
  withdrawalMode: WithdrawalMode;
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
export const enrollmentTranslator = () => createTranslator(getCurrentLanguage());
const fail = (key: string) => new Error(enrollmentTranslator().t(key));

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

export function invitationFromAddress(): EnrollmentInvitation {
  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (query.has('accessCode')) throw new Error(enrollmentTranslator().t('enrollment.error_credential_in_query'));

  const studyId = query.get('studyId')?.trim() ?? '';
  const participantId = query.get('participantId')?.trim() ?? '';
  const accessCode = fragment.get('accessCode') ?? '';
  if (
    !UUID_PATTERN.test(studyId) ||
    !participantId ||
    participantId.length > 256 ||
    !isValidParticipantAccessCode(accessCode)
  ) {
    throw new Error(enrollmentTranslator().t('enrollment.error_incomplete'));
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
  if (!isRecord(payload) || !isRecord(payload.manifest)) throw fail('enrollment.unsupported_preview');
  const manifest = payload.manifest;
  const digest = payload.manifestDigest;
  if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) throw fail('enrollment.invalid_manifest_digest');
  if (manifest.schemaVersion !== 1) throw fail('enrollment.unsupported_preview');

  validateManifestIdentity(manifest, invitation, expectedServerOrigin);
  const expiresAt = validateManifestTimes(manifest);
  validateCollectionSettings(manifest);

  if (!isRecord(manifest.participantPolicy)) throw fail('enrollment.invalid_participant_policy');
  const policy = manifest.participantPolicy;
  const withdrawalMode = manifest.withdrawalMode;
  if (withdrawalMode !== WITHDRAWAL_MODES.erase && withdrawalMode !== WITHDRAWAL_MODES.keepPriorData)
    throw fail('enrollment.unsupported_preview');
  const effectiveAt = requiredString(policy, 'effectiveAt');
  if (!isRfc3339OffsetDateTime(effectiveAt)) throw fail('enrollment.invalid_policy_effective_date');
  return {
    expiresAt,
    withdrawalMode,
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
    studyDescription:
      optionalText(manifest, 'studyDescription') || enrollmentTranslator().t('enrollment.no_short_description'),
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
