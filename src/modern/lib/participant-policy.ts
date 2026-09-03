import { createTranslator, type Translator } from '@/i18n/translator';
export type ParticipantPolicyForm = {
  consentDocumentUrl: string;
  dataUseAndSharing: string;
  effectiveAt: string;
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

export type StudyParticipantPolicySetting = Omit<ParticipantPolicyForm, 'consentDocumentUrl'> & {
  '@class'?: string;
  consentDocumentUrl: string | null;
};

export type ParticipantPolicyErrors = Partial<Record<keyof ParticipantPolicyForm, string>>;

export const EMPTY_PARTICIPANT_POLICY_FORM: ParticipantPolicyForm = {
  responsibleInstitution: '',
  serverOperator: '',
  researchContact: '',
  purpose: '',
  expectedDuration: '',
  procedures: '',
  foreseeableRisks: '',
  expectedBenefits: '',
  dataUseAndSharing: '',
  retentionAndDeletion: '',
  privacyPolicyUrl: '',
  withdrawalUrl: '',
  consentDocumentUrl: '',
  version: '',
  effectiveAt: '',
};

const TEXT_LIMIT = 8_000;
const VERSION_LIMIT = 128;
const URL_LIMIT = 2_048;

// Validation messages are rendered next to the field, so they resolve through the caller's
// translator (default English). Labels live under policy_validation.label_<field>.
type Translate = Translator['t'];
const ENGLISH = createTranslator('en');

function fieldLabel(t: Translate, field: keyof ParticipantPolicyForm): string {
  return t(`policy_validation.label_${field}`);
}

const REQUIRED_TEXT_FIELDS = [
  'responsibleInstitution',
  'serverOperator',
  'researchContact',
  'purpose',
  'expectedDuration',
  'procedures',
  'foreseeableRisks',
  'expectedBenefits',
  'dataUseAndSharing',
  'retentionAndDeletion',
] as const satisfies ReadonlyArray<keyof ParticipantPolicyForm>;

const OFFSET_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: keyof ParticipantPolicyForm): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

export function participantPolicyToForm(value: unknown): ParticipantPolicyForm {
  const policy = isRecord(value) ? value : {};
  return {
    responsibleInstitution: stringField(policy, 'responsibleInstitution'),
    serverOperator: stringField(policy, 'serverOperator'),
    researchContact: stringField(policy, 'researchContact'),
    purpose: stringField(policy, 'purpose'),
    expectedDuration: stringField(policy, 'expectedDuration'),
    procedures: stringField(policy, 'procedures'),
    foreseeableRisks: stringField(policy, 'foreseeableRisks'),
    expectedBenefits: stringField(policy, 'expectedBenefits'),
    dataUseAndSharing: stringField(policy, 'dataUseAndSharing'),
    retentionAndDeletion: stringField(policy, 'retentionAndDeletion'),
    privacyPolicyUrl: stringField(policy, 'privacyPolicyUrl'),
    withdrawalUrl: stringField(policy, 'withdrawalUrl'),
    consentDocumentUrl: stringField(policy, 'consentDocumentUrl'),
    version: stringField(policy, 'version'),
    effectiveAt: stringField(policy, 'effectiveAt'),
  };
}

function validateUrl(
  t: Translate,
  field: 'consentDocumentUrl' | 'privacyPolicyUrl' | 'withdrawalUrl',
  value: string,
): string | null {
  const label = fieldLabel(t, field);
  if (value.length > URL_LIMIT) return `${label} must be at most ${URL_LIMIT} characters.`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return t('policy_validation.https_url', { label });
  }
  if (url.protocol !== 'https:' || !url.hostname) return t('policy_validation.https_url', { label });
  if (url.username || url.password) return t('policy_validation.https_url_no_credentials', { label });
  return null;
}

function validateOffsetDateTime(value: string, t: Translate = ENGLISH.t): string | null {
  const match = OFFSET_DATE_TIME.exec(value);
  if (!match) return t('policy_validation.offset_datetime');
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', , offsetHourText, offsetMinuteText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = Number(offsetHourText ?? 0);
  const offsetMinute = Number(offsetMinuteText ?? 0);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  const valid =
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 18 &&
    offsetMinute <= 59 &&
    (offsetHour < 18 || offsetMinute === 0);
  return valid ? null : t('policy_validation.valid_datetime');
}

export function isRfc3339OffsetDateTime(value: string): boolean {
  return validateOffsetDateTime(value) === null;
}

function validateRequiredTextFields(form: ParticipantPolicyForm, errors: ParticipantPolicyErrors, t: Translate) {
  for (const field of REQUIRED_TEXT_FIELDS) {
    const value = form[field].trim();
    const label = fieldLabel(t, field);
    if (!value) errors[field] = t('policy_validation.required', { label });
    else if (value.length > TEXT_LIMIT)
      errors[field] = t('policy_validation.max_length', { label, limit: String(TEXT_LIMIT) });
  }
}

function validatePolicyUrls(form: ParticipantPolicyForm, errors: ParticipantPolicyErrors, t: Translate) {
  for (const field of ['privacyPolicyUrl', 'withdrawalUrl'] as const) {
    const value = form[field].trim();
    const error = value
      ? validateUrl(t, field, value)
      : t('policy_validation.required', { label: fieldLabel(t, field) });
    if (error) errors[field] = error;
  }
  const consentDocumentUrl = form.consentDocumentUrl.trim();
  if (!consentDocumentUrl) return;
  const error = validateUrl(t, 'consentDocumentUrl', consentDocumentUrl);
  if (error) errors.consentDocumentUrl = error;
}

export function validateParticipantPolicy(
  form: ParticipantPolicyForm,
  t: Translate = ENGLISH.t,
): ParticipantPolicyErrors {
  const errors: ParticipantPolicyErrors = {};
  validateRequiredTextFields(form, errors, t);

  const versionLabel = fieldLabel(t, 'version');
  const version = form.version.trim();
  if (!version) errors.version = t('policy_validation.required', { label: versionLabel });
  else if (version.length > VERSION_LIMIT)
    errors.version = t('policy_validation.max_length', { label: versionLabel, limit: String(VERSION_LIMIT) });

  validatePolicyUrls(form, errors, t);

  const effectiveAt = form.effectiveAt.trim();
  const effectiveAtError = effectiveAt
    ? validateOffsetDateTime(effectiveAt, t)
    : t('policy_validation.required', { label: fieldLabel(t, 'effectiveAt') });
  if (effectiveAtError) errors.effectiveAt = effectiveAtError;
  return errors;
}

export function buildStudyParticipantPolicy(form: ParticipantPolicyForm): StudyParticipantPolicySetting {
  const errors = validateParticipantPolicy(form);
  const firstError = Object.values(errors)[0];
  if (firstError) throw new Error(firstError);
  const trimmed = participantPolicyToForm(
    Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])),
  );
  return {
    '@class': 'com.openlattice.chronicle.study.StudyParticipantPolicy',
    ...trimmed,
    consentDocumentUrl: trimmed.consentDocumentUrl || null,
  };
}
