import {
  APP_USAGE_FREQUENCIES,
  type AppUsageFrequency,
  ENROLLMENT_LOCKED_SETTING_FIELDS,
  type StudySettingType,
  WITHDRAWAL_MODE,
} from '@/generated/chronicle-contracts';
import { getCurrentLanguage } from '@/i18n/language-context';
import { createTranslator } from '@/i18n/translator';
import { sanitizeFilename } from '@/lib/download';
import { EMPTY_PARTICIPANT_POLICY_FORM, participantPolicyToForm } from '@/lib/participant-policy';
import { COLLECTION_MODULES, STUDY_FEATURES, type WithdrawalMode } from '@/lib/study-constants';
import { moduleDraftsFromSetting } from '@/lib/study-form-helpers';
import { portableModuleDraftSchema, type StudyFormData } from '@/lib/study-form-model';

// Portable study configuration: everything the study form edits, as one JSON document a
// researcher can download from one study and load into another (on this server or any other
// Chronicle deployment). Deliberately NOT a server object: it is the form state, so every field
// the modal shows is covered, and importing runs through the same validation and write path as
// typing the values by hand. `PORTABLE_FIELDS` below is checked against PortableStudyConfig at
// compile time, so a new StudyFormData field must be carried or excluded explicitly.
//
// Excluded on purpose:
//  - the study id, organization and participants (not form state at all);
//  - the `loaded*` carry-through fields (they describe the study being edited).

export const STUDY_CONFIG_FORMAT = 'chronicle-study-config';
export const STUDY_CONFIG_VERSION = 1;
export const STUDY_CONFIG_MAX_BYTES = 1_000_000;

export class StudyConfigError extends Error {
  override name = 'StudyConfigError';
}

type StudyConfigFile = {
  format: typeof STUDY_CONFIG_FORMAT;
  version: typeof STUDY_CONFIG_VERSION;
  exportedAt: string;
  study: PortableStudyConfig;
};

export type PortableStudyConfig = Omit<
  StudyFormData,
  | 'loadedAppUsageFrequency'
  | 'loadedLimits'
  | 'loadedModules'
  | 'loadedSettingLocks'
  | 'loadedParticipantPolicy'
  | 'loadedWithdrawalMode'
  | 'loadedTimeZone'
  | 'loadedTimeUseDiary'
>;

const STRING_FIELDS = [
  'contact',
  'dataRetentionDays',
  'description',
  'group',
  'studyDurationDays',
  'title',
  'version',
] as const satisfies ReadonlyArray<keyof PortableStudyConfig>;

// Compile-time exhaustiveness: every portable field must be handled by parseStudyConfig, which
// is a hand-written allow-list. A new StudyFormData field breaks the build here until it is
// listed above or added to NON_PORTABLE_FIELDS.
type CoveredField =
  | (typeof STRING_FIELDS)[number]
  | 'appUsageFrequency'
  | 'timeZone'
  | 'modules'
  | 'features'
  | 'participantPolicy'
  | 'withdrawalMode';
/** @public Compile-time proof that every portable field is parsed. */
export const _everyPortableFieldIsParsed: Exclude<keyof PortableStudyConfig, CoveredField> extends never
  ? true
  : never = true;

// The study features the dialog actually offers as toggles. A feature outside this set cannot
// be seen or removed in the form, and an unknown one fails the whole create/update on the
// server enum, so an imported file never introduces one.
const OFFERED_FEATURES = new Set<string>(STUDY_FEATURES.map(({ value }) => value));

export function toPortableStudyConfig(form: StudyFormData): PortableStudyConfig {
  const portable = { ...form, participantPolicy: participantPolicyToForm(form.participantPolicy) };
  delete portable.loadedAppUsageFrequency;
  delete portable.loadedLimits;
  delete portable.loadedModules;
  delete portable.loadedParticipantPolicy;
  delete portable.loadedSettingLocks;
  delete portable.loadedWithdrawalMode;
  delete portable.loadedTimeZone;
  delete portable.loadedTimeUseDiary;
  return portable;
}

export function serializeStudyConfig(form: StudyFormData, exportedAt: Date = new Date()): string {
  const file: StudyConfigFile = {
    format: STUDY_CONFIG_FORMAT,
    version: STUDY_CONFIG_VERSION,
    exportedAt: exportedAt.toISOString(),
    study: toPortableStudyConfig(form),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function studyConfigFileName(title: string, exportedAt: Date = new Date()): string {
  // Unicode-aware: an accented or non-Latin title keeps its letters instead of collapsing to
  // "study", so two studies exported on the same day get distinguishable filenames.
  const slug =
    title
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'study';
  const day = exportedAt.toISOString().slice(0, 10);
  return sanitizeFilename(`${slug}-config-${day}.json`);
}

function fail(key: string, values?: Record<string, string>): never {
  throw new StudyConfigError(createTranslator(getCurrentLanguage()).t(key, values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

const isString = (value: unknown): value is string => typeof value === 'string';

function requireField<T>(study: Record<string, unknown>, field: string, guard: (v: unknown) => v is T): T {
  const value = study[field];
  if (!guard(value)) fail('study_config.invalid_field', { field });
  return value;
}

function optionalField<T>(study: Record<string, unknown>, field: string, guard: (v: unknown) => v is T): T | undefined {
  const value = study[field];
  if (value === undefined || value === null) return undefined;
  if (!guard(value)) fail('study_config.invalid_field', { field });
  return value;
}

function parseEnvelope(text: string): Record<string, unknown> {
  if (text.length > STUDY_CONFIG_MAX_BYTES) fail('study_config.too_large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('study_config.not_json');
  }
  if (!isRecord(parsed) || parsed.format !== STUDY_CONFIG_FORMAT) fail('study_config.wrong_format');
  // Only a scalar version can be named in the "unsupported version" sentence; anything else
  // would put a JavaScript literal (undefined, [object Object]) into translated prose.
  if (typeof parsed.version !== 'number' && typeof parsed.version !== 'string') {
    fail('study_config.invalid_field', { field: 'version' });
  }
  if (parsed.version !== STUDY_CONFIG_VERSION) {
    fail('study_config.wrong_version', { version: String(parsed.version) });
  }
  if (!isRecord(parsed.study)) fail('study_config.invalid_field', { field: 'study' });
  return parsed.study;
}

function moduleDraftsFromFile(study: Record<string, unknown>): PortableStudyConfig['modules'] {
  const modules = requireField(study, 'modules', isRecord);
  const defaults = moduleDraftsFromSetting();
  return Object.fromEntries(
    COLLECTION_MODULES.map(({ value, alwaysOn }) => {
      if (modules[value] === undefined) return [value, defaults[value]];
      const parsed = portableModuleDraftSchema.safeParse(modules[value]);
      if (!parsed.success || (alwaysOn && parsed.data.mode === 'disabled'))
        fail('study_config.invalid_field', { field: `modules.${value}` });
      return [value, parsed.data];
    }),
  ) as PortableStudyConfig['modules'];
}

/**
 * Parses a downloaded study configuration back into form state. Every field is type-checked;
 * a file this build cannot read (wrong format, newer version, wrong field type) is rejected
 * with a translated message rather than half-loaded. Values the dialog cannot show are not
 * taken from the file at all (including features it does not offer), and every
 * per-module map is completed from the generated contract so the form shows what it will save.
 * Value-level validation (email shape, required policy text, Health Connect scope) is the
 * form's own job once the values land.
 */
export function parseStudyConfig(text: string): PortableStudyConfig {
  const study = parseEnvelope(text);
  const config: Record<string, unknown> = {};
  for (const field of STRING_FIELDS) config[field] = requireField(study, field, isString);
  config.features = requireField(study, 'features', isStringArray).filter((feature) => OFFERED_FEATURES.has(feature));
  config.withdrawalMode = optionalField(
    study,
    'withdrawalMode',
    (value): value is WithdrawalMode => value === WITHDRAWAL_MODE.KEEP_PRIOR_DATA || value === WITHDRAWAL_MODE.ERASE,
  );
  config.appUsageFrequency = optionalField(study, 'appUsageFrequency', (value): value is AppUsageFrequency =>
    APP_USAGE_FREQUENCIES.some((frequency) => frequency === value),
  );
  config.timeZone = optionalField(study, 'timeZone', isString);
  config.modules = moduleDraftsFromFile(study);
  const policy = study.participantPolicy;
  if (policy !== undefined && !isRecord(policy)) fail('study_config.invalid_field', { field: 'participantPolicy' });
  config.participantPolicy = policy === undefined ? EMPTY_PARTICIPANT_POLICY_FORM : participantPolicyToForm(policy);
  // Drop undefined optionals so the result round-trips through JSON as an equal object.
  for (const key of Object.keys(config)) if (config[key] === undefined) delete config[key];
  return config as unknown as PortableStudyConfig;
}

/**
 * Names what a readable file carries that parseStudyConfig does not take: features the dialog
 * does not offer, the non-portable fields, and module ids this build does not know. The import
 * status line lists them, so a copy is never saved believing it matches a source it does not.
 */
export function ignoredStudyConfigEntries(text: string): string[] {
  const study = parseEnvelope(text);
  const features = isStringArray(study.features) ? study.features : [];
  const moduleIds = isRecord(study.modules) ? Object.keys(study.modules) : [];
  const known = new Set<string>(COLLECTION_MODULES.map((module) => module.value));
  return [
    ...features.filter((feature) => !OFFERED_FEATURES.has(feature)),
    ...(study.moduleDispositions !== undefined ? ['moduleDispositions'] : []),
    ...moduleIds.filter((id) => !known.has(id)),
  ];
}

/**
 * The server's per-setting lock response determines whether the current policy is retained.
 */
export function keepsCurrentParticipantPolicy(current: StudyFormData): boolean {
  return studyFieldLocked(current, 'participantPolicy');
}

/**
 * Applies an imported configuration onto the open form. Fields the file does not carry keep the
 * open form's values: the `loaded*` carry-through fields, features the dialog does not offer, and settings locked by enrollment.
 */
export function studyFieldLocked(current: StudyFormData, field: keyof StudyFormData): boolean {
  return Object.entries(ENROLLMENT_LOCKED_SETTING_FIELDS).some(
    ([setting, formField]) => formField === field && current.loadedSettingLocks?.includes(setting as StudySettingType),
  );
}

export function applyStudyConfig(current: StudyFormData, imported: PortableStudyConfig): StudyFormData {
  return {
    ...current,
    ...imported,
    features: [...imported.features, ...current.features.filter((feature) => !OFFERED_FEATURES.has(feature))],
    ...Object.fromEntries(
      Object.values(ENROLLMENT_LOCKED_SETTING_FIELDS)
        .filter((field) => studyFieldLocked(current, field))
        .map((field) => [field, current[field]]),
    ),
    loadedLimits: current.loadedLimits,
    loadedModules: current.loadedModules,
    loadedParticipantPolicy: current.loadedParticipantPolicy,
  };
}
