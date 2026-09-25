import type { StudyFormData } from '@/components/study-form-dialog';
import { getCurrentLanguage } from '@/i18n/language-context';
import { createTranslator } from '@/i18n/translator';
import { sanitizeFilename } from '@/lib/download';
import { EMPTY_PARTICIPANT_POLICY_FORM, participantPolicyToForm } from '@/lib/participant-policy';
import {
  COLLECTION_MODULES,
  type CollectionModuleDescriptor,
  DEFAULT_COLLECTION_INTERVAL_SECONDS,
  DEFAULT_SENSOR_DUTY_ACTIVE,
  DEFAULT_SENSOR_DUTY_PERIOD,
  DEFAULT_SENSOR_RATE_HZ,
  STUDY_FEATURES,
} from '@/lib/study-constants';

// Portable study configuration: everything the study form edits, as one JSON document a
// researcher can download from one study and load into another (on this server or any other
// Chronicle deployment). Deliberately NOT a server object: it is the form state, so every field
// the modal shows is covered, and importing runs through the same validation and write path as
// typing the values by hand. `PORTABLE_FIELDS` below is checked against PortableStudyConfig at
// compile time, so a new StudyFormData field must be carried or excluded explicitly.
//
// Excluded on purpose:
//  - the study id, organization and participants (not form state at all);
//  - the `loaded*` carry-through fields (they describe the study being edited);
//  - the legacy top-level sensor fields and the per-module disable dispositions — see
//    NON_PORTABLE_FIELDS.

export const STUDY_CONFIG_FORMAT = 'chronicle-study-config';
export const STUDY_CONFIG_VERSION = 1;
export const STUDY_CONFIG_MAX_BYTES = 1_000_000;

export type StudyConfigFile = {
  format: typeof STUDY_CONFIG_FORMAT;
  version: typeof STUDY_CONFIG_VERSION;
  exportedAt: string;
  study: PortableStudyConfig;
};

// Form fields a file never carries, and an import therefore never changes:
//  - samplingRateHz / dutyCycle* / selectedSensors / selectedIosSensors belong to the legacy
//    top-level AndroidSensor + Sensor settings. The dialog offers no control for them (the
//    per-sensor collection modules replaced them), so an imported value would be invisible,
//    un-editable and still written by buildSensorSetting / buildIosSensorSetting — including an
//    IOS_SENSOR feature with an empty sensor list, which makes isFormComplete false forever.
//  - moduleDispositions is not configuration: it is a one-shot instruction for what a device
//    does with unsent data when a module goes ACTIVE -> INACTIVE. Carrying another study's
//    `discard_and_stop` into this one can destroy participant data the operator never chose to
//    drop, and the picker that would show it is hidden inside a collapsed group.
const NON_PORTABLE_FIELDS = [
  'dutyCycleActiveSeconds',
  'dutyCyclePeriodSeconds',
  'moduleDispositions',
  'samplingRateHz',
  'selectedIosSensors',
  'selectedSensors',
] as const satisfies ReadonlyArray<keyof StudyFormData>;

export type PortableStudyConfig = Omit<
  StudyFormData,
  'loadedLimits' | 'loadedModules' | 'loadedParticipantPolicy' | (typeof NON_PORTABLE_FIELDS)[number]
>;

const STRING_FIELDS = [
  'contact',
  'dataRetentionDays',
  'description',
  'group',
  'participantLimit',
  'studyDurationDays',
  'title',
  'version',
] as const satisfies ReadonlyArray<keyof PortableStudyConfig>;

const OPTIONAL_STRING_FIELDS = ['interactionGridRows', 'interactionGridCols'] as const satisfies ReadonlyArray<
  keyof PortableStudyConfig
>;

const OPTIONAL_BOOLEAN_FIELDS = [
  'interactionCaptureClicks',
  'interactionCaptureScrolls',
  'interactionCaptureExactPosition',
] as const satisfies ReadonlyArray<keyof PortableStudyConfig>;

const OPTIONAL_STRING_ARRAY_FIELDS = ['healthConnectRecordTypes'] as const satisfies ReadonlyArray<
  keyof PortableStudyConfig
>;

const STRING_MAP_FIELDS = [
  'moduleIntervalSeconds',
  'sensorDutyActive',
  'sensorDutyPeriod',
  'sensorRateHz',
] as const satisfies ReadonlyArray<keyof PortableStudyConfig>;

const BOOLEAN_MAP_FIELDS = ['moduleRequired', 'moduleSettings'] as const satisfies ReadonlyArray<
  keyof PortableStudyConfig
>;

// Compile-time exhaustiveness: every portable field must be handled by parseStudyConfig, which
// is a hand-written allow-list. A new StudyFormData field breaks the build here until it is
// listed above or added to NON_PORTABLE_FIELDS.
type CoveredField =
  | (typeof STRING_FIELDS)[number]
  | (typeof OPTIONAL_STRING_FIELDS)[number]
  | (typeof OPTIONAL_BOOLEAN_FIELDS)[number]
  | (typeof OPTIONAL_STRING_ARRAY_FIELDS)[number]
  | (typeof STRING_MAP_FIELDS)[number]
  | (typeof BOOLEAN_MAP_FIELDS)[number]
  | 'features'
  | 'notificationsEnabled'
  | 'participantPolicy';
export const _everyPortableFieldIsParsed: Exclude<keyof PortableStudyConfig, CoveredField> extends never
  ? true
  : never = true;

// The study features the dialog actually offers as toggles. A feature outside this set cannot
// be seen or removed in the form, and an unknown one fails the whole create/update on the
// server enum, so an imported file never introduces one.
const OFFERED_FEATURES = new Set<string>(STUDY_FEATURES.map(({ value }) => value));

export function toPortableStudyConfig(form: StudyFormData): PortableStudyConfig {
  const portable: StudyFormData = { ...form, participantPolicy: participantPolicyToForm(form.participantPolicy) };
  delete portable.loadedLimits;
  delete portable.loadedModules;
  delete portable.loadedParticipantPolicy;
  for (const field of NON_PORTABLE_FIELDS) delete portable[field];
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
  throw new Error(createTranslator(getCurrentLanguage()).t(key, values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isMapOf<T>(value: unknown, guard: (item: unknown) => item is T): value is Record<string, T> {
  return isRecord(value) && Object.values(value).every(guard);
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

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

// Rebuild a per-module map over the known modules only: the file's value where it has one, the
// contract default otherwise. getInitialFormData guarantees a fully populated map; a partial one
// would render as "Disabled" in the dialog (renderModuleRow: `?? false`) while the write path
// sends the module's own default (buildModuleEntry: `?? defaultEnabled`), so the form would show
// a state it is not about to save. Unknown module ids are dropped — nothing can edit them.
function moduleMap<T>(
  fileValues: Record<string, T> | undefined,
  resolve: (module: CollectionModuleDescriptor, fileValue: T | undefined) => T | undefined,
): Record<string, T> {
  const resolved: Record<string, T> = {};
  for (const module of COLLECTION_MODULES) {
    const value = resolve(module, fileValues?.[module.value]);
    if (value !== undefined) resolved[module.value] = value;
  }
  return resolved;
}

function sensorMap(fileValues: Record<string, string> | undefined, fallback: string): Record<string, string> {
  return moduleMap(fileValues, (module, value) => (module.sensorType ? (value ?? fallback) : value));
}

/**
 * Parses a downloaded study configuration back into form state. Every field is type-checked;
 * a file this build cannot read (wrong format, newer version, wrong field type) is rejected
 * with a translated message rather than half-loaded. Values the dialog cannot show are not
 * taken from the file at all (features it does not offer, the legacy sensor fields), and every
 * per-module map is completed from the generated contract so the form shows what it will save.
 * Value-level validation (email shape, required policy text, Health Connect scope) is the
 * form's own job once the values land.
 */
export function parseStudyConfig(text: string): PortableStudyConfig {
  const study = parseEnvelope(text);
  const config: Record<string, unknown> = {};
  for (const field of STRING_FIELDS) config[field] = requireField(study, field, isString);
  config.features = requireField(study, 'features', isStringArray).filter((feature) => OFFERED_FEATURES.has(feature));
  config.notificationsEnabled = requireField(study, 'notificationsEnabled', isBoolean);
  for (const field of OPTIONAL_STRING_FIELDS) config[field] = optionalField(study, field, isString);
  for (const field of OPTIONAL_BOOLEAN_FIELDS) config[field] = optionalField(study, field, isBoolean);
  for (const field of OPTIONAL_STRING_ARRAY_FIELDS) config[field] = optionalField(study, field, isStringArray);
  const stringMaps: Record<string, Record<string, string> | undefined> = {};
  for (const field of STRING_MAP_FIELDS) {
    stringMaps[field] = optionalField(study, field, (v): v is Record<string, string> => isMapOf(v, isString));
  }
  const booleanMaps: Record<string, Record<string, boolean> | undefined> = {};
  for (const field of BOOLEAN_MAP_FIELDS) {
    booleanMaps[field] = optionalField(study, field, (v): v is Record<string, boolean> => isMapOf(v, isBoolean));
  }
  config.moduleSettings = moduleMap(booleanMaps.moduleSettings, (module, value) =>
    module.alwaysOn ? true : (value ?? module.defaultEnabled),
  );
  config.moduleRequired = moduleMap(booleanMaps.moduleRequired, (_module, value) => value ?? false);
  config.moduleIntervalSeconds = moduleMap(
    stringMaps.moduleIntervalSeconds,
    (_module, value) => value ?? DEFAULT_COLLECTION_INTERVAL_SECONDS,
  );
  config.sensorRateHz = sensorMap(stringMaps.sensorRateHz, DEFAULT_SENSOR_RATE_HZ);
  config.sensorDutyActive = sensorMap(stringMaps.sensorDutyActive, DEFAULT_SENSOR_DUTY_ACTIVE);
  config.sensorDutyPeriod = sensorMap(stringMaps.sensorDutyPeriod, DEFAULT_SENSOR_DUTY_PERIOD);
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
  const moduleIds = isRecord(study.moduleSettings) ? Object.keys(study.moduleSettings) : [];
  const known = new Set<string>(COLLECTION_MODULES.map((module) => module.value));
  return [
    ...features.filter((feature) => !OFFERED_FEATURES.has(feature)),
    ...NON_PORTABLE_FIELDS.filter((field) => study[field] !== undefined),
    ...moduleIds.filter((id) => !known.has(id)),
  ];
}

/**
 * True when the open form is editing a study that already has a saved participant policy. The
 * server locks that policy once enrollment starts (ensureParticipantPolicyMutable -> 409), and
 * the edit path PATCHes it whenever it differs from the loaded one, so replacing it with a file's
 * policy would make every save report a partial failure with no way back to the original text.
 */
export function keepsCurrentParticipantPolicy(current: StudyFormData): boolean {
  const loaded = current.loadedParticipantPolicy;
  return isRecord(loaded) && Object.keys(loaded).length > 0;
}

/**
 * Applies an imported configuration onto the open form. Fields the file does not carry keep the
 * open form's values: the `loaded*` carry-through fields, the legacy sensor configuration and
 * dispositions (NON_PORTABLE_FIELDS), the features the dialog does not offer, and — when editing a
 * study that already has one — the participant policy.
 */
export function applyStudyConfig(current: StudyFormData, imported: PortableStudyConfig): StudyFormData {
  return {
    ...current,
    ...imported,
    features: [...imported.features, ...current.features.filter((feature) => !OFFERED_FEATURES.has(feature))],
    ...(keepsCurrentParticipantPolicy(current) ? { participantPolicy: current.participantPolicy } : {}),
    loadedLimits: current.loadedLimits,
    loadedModules: current.loadedModules,
    loadedParticipantPolicy: current.loadedParticipantPolicy,
  };
}
