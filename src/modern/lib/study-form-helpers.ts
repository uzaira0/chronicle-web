import { getCurrentLanguage } from '@/i18n/language-context';
import { createTranslator } from '@/i18n/translator';
import { collectionNumberValidationProblems, isCollectionNumber } from '@/lib/collection-numbers';
import {
  COLLECTION_MODULES,
  type CollectionModuleId,
  DEFAULT_COLLECTION_INTERVAL_SECONDS,
  DEFAULT_SENSOR_DUTY_ACTIVE,
  DEFAULT_SENSOR_DUTY_PERIOD,
  DEFAULT_SENSOR_RATE_HZ,
  DEFAULT_STUDY_TIME_ZONE,
  DEFAULT_WITHDRAWAL_MODE,
  HEALTH_CONNECT_RECORD_TYPES,
  INTERVAL_CONFIGURABLE_MODULES,
  isKnownHealthConnectRecordType,
  isPlayStoreBuildModule,
  STUDY_SETTING_CLASSES,
} from '@/lib/study-constants';
import { DEFAULT_INTERACTION_CONFIG, type ModuleDraft, type StudyFormData } from '@/lib/study-form-model';
import type { DataCollectionSettingSummary } from '@/state/study-operations-api';

export function studyDurationToDays(duration: { days: number; months: number; years: number }) {
  return (duration.years || 0) * 365 + (duration.months || 0) * 30 + (duration.days || 0);
}

export function daysToStudyDuration(totalDays: number) {
  return { years: 0, months: 0, days: totalDays };
}

export function buildStudyPayload(form: StudyFormData) {
  return {
    ...buildStudyUpdatePayload(form),
    settings: { DataCollection: buildDataCollectionSetting(form) },
  };
}

export function buildStudyUpdatePayload(form: StudyFormData) {
  const modules: Record<string, Record<string, unknown>> = {};
  for (const feature of form.features) {
    modules[feature] = {};
  }

  return {
    title: form.title.trim(),
    contact: form.contact.trim(),
    description: form.description.trim(),
    group: form.group.trim(),
    version: form.version.trim(),
    modules,
  };
}

export function buildAppUsageSurveySetting(form: StudyFormData) {
  const appUsageFrequency = form.appUsageFrequency ?? 'DAILY';
  if (form.loadedAppUsageFrequency === appUsageFrequency) return null;
  return { '@class': STUDY_SETTING_CLASSES.AppUsageSurvey, appUsageFrequency };
}

export function buildWithdrawalSetting(form: StudyFormData) {
  const mode = form.withdrawalMode ?? DEFAULT_WITHDRAWAL_MODE;
  if (form.loadedWithdrawalMode === mode) return null;
  return {
    '@class': STUDY_SETTING_CLASSES.Withdrawal,
    mode,
  };
}

export function buildTimeUseDiarySetting(form: StudyFormData) {
  if (form.loadedTimeZone === (form.timeZone ?? DEFAULT_STUDY_TIME_ZONE)) return null;
  return {
    ...form.loadedTimeUseDiary,
    '@class': STUDY_SETTING_CLASSES.TimeUseDiary,
    timeZone: form.timeZone ?? DEFAULT_STUDY_TIME_ZONE,
  };
}

type StoredModule = NonNullable<DataCollectionSettingSummary['modules']>[string] | undefined;
const MODULE_POLICY_DRAFTS: Partial<Record<CollectionModuleId, (entry: StoredModule) => Partial<ModuleDraft>>> = {
  interaction_events: (entry) => {
    const policy = entry?.interactionPolicy;
    return {
      interaction: {
        gridRows: String(policy?.gridRows ?? DEFAULT_INTERACTION_CONFIG.gridRows),
        gridCols: String(policy?.gridCols ?? DEFAULT_INTERACTION_CONFIG.gridCols),
        captureClicks: policy?.captureClicks ?? DEFAULT_INTERACTION_CONFIG.captureClicks,
        captureScrolls: policy?.captureScrolls ?? DEFAULT_INTERACTION_CONFIG.captureScrolls,
        captureElementPosition: policy?.captureElementPosition ?? DEFAULT_INTERACTION_CONFIG.captureElementPosition,
      },
    };
  },
  health_connect: (entry) => ({
    healthConnectRecordTypes: Array.isArray(entry?.healthConnectRecordTypes)
      ? [...new Set(entry.healthConnectRecordTypes)]
      : [],
  }),
};

/** One read adapter for sparse server settings, including defaults for every active module. */
export function moduleDraftsFromSetting(
  setting?: Pick<DataCollectionSettingSummary, 'modules'>,
): StudyFormData['modules'] {
  return Object.fromEntries(
    COLLECTION_MODULES.map(({ value, alwaysOn, defaultEnabled, sensorType, consentGated }) => {
      const entry = setting?.modules?.[value];
      const enabled = alwaysOn || (entry?.enabled ?? defaultEnabled);
      const sensor = entry?.sensorPolicy;
      const draft: ModuleDraft = {
        mode: enabled ? (consentGated && entry?.required ? 'required' : 'optional') : 'disabled',
        intervalSeconds: entry?.collectionCadence?.intervalSeconds?.toString() ?? DEFAULT_COLLECTION_INTERVAL_SECONDS,
        ...(sensorType
          ? {
              sensorPolicy: {
                rateHz: String(sensor?.samplingRateHz ?? DEFAULT_SENSOR_RATE_HZ),
                dutyActive: String(sensor?.dutyCycleActiveSeconds ?? DEFAULT_SENSOR_DUTY_ACTIVE),
                dutyPeriod: String(sensor?.dutyCyclePeriodSeconds ?? DEFAULT_SENSOR_DUTY_PERIOD),
              },
            }
          : {}),
        ...MODULE_POLICY_DRAFTS[value]?.(entry),
      };
      return [value, draft];
    }),
  ) as StudyFormData['modules'];
}

export function toggleHealthConnectRecordType(current: string[], recordType: string): string[] {
  const selected = new Set(current);
  if (selected.has(recordType)) selected.delete(recordType);
  else selected.add(recordType);
  return [
    ...HEALTH_CONNECT_RECORD_TYPES.map(({ value }) => value).filter((value) => selected.has(value)),
    ...current.filter((value) => !isKnownHealthConnectRecordType(value) && selected.has(value)),
  ];
}

export function healthConnectScopeMissing(draft: ModuleDraft): boolean {
  return draft.mode !== 'disabled' && (draft.healthConnectRecordTypes?.length ?? 0) === 0;
}

function applyHealthConnectScope(
  moduleEntry: Record<string, unknown>,
  form: StudyFormData,
  enabled: boolean,
  moduleId: CollectionModuleId,
) {
  const draft = form.modules[moduleId];
  if (draft.healthConnectRecordTypes === undefined) return;
  const selectedRecordTypes = [...new Set(draft.healthConnectRecordTypes.filter((recordType) => recordType))];
  if (
    healthConnectScopeMissing({
      ...draft,
      mode: enabled ? 'optional' : 'disabled',
      healthConnectRecordTypes: selectedRecordTypes,
    })
  ) {
    throw new Error(createTranslator(getCurrentLanguage()).t('study_form.hc_scope_error'));
  }
  // Disabled means no approved scope. Sending an explicit empty list prevents a
  // previously selected scope from surviving a disable/re-enable cycle unnoticed.
  moduleEntry.healthConnectRecordTypes = enabled ? selectedRecordTypes : [];
}

function moduleEnabledInForm(form: StudyFormData, module: (typeof COLLECTION_MODULES)[number]): boolean {
  return module.alwaysOn ? true : form.modules[module.value].mode !== 'disabled';
}

/** Enabled modules the Play Store Android app does not collect (participants on it cannot enroll). */
export function playStoreUnsupportedModules(form: StudyFormData): CollectionModuleId[] {
  if (!form.features.includes('CHRONICLE_DATA_COLLECTION')) return [];
  return COLLECTION_MODULES.filter(
    (module) => moduleEnabledInForm(form, module) && !isPlayStoreBuildModule(module.value),
  ).map(({ value }) => value);
}

function buildModuleEntry(form: StudyFormData, module: (typeof COLLECTION_MODULES)[number]): Record<string, unknown> {
  const { value, sensorType } = module;
  // `enabled` is always sent explicitly — the backend CollectionModuleSetting has no
  // default for it. `required` (per-module consent design §3.1) is meaningful only while
  // enabled, but is always sent (mirrors `enabled`, keeps the write idempotent); defaults
  // optional (false), and a disabled module is never required. An always-on module is
  // written enabled whatever the form state says (stale state from before the lock).
  const enabled = moduleEnabledInForm(form, module);
  const draft = form.modules[value];
  const required = enabled && module.consentGated && draft.mode === 'required';
  const moduleEntry: Record<string, unknown> = { enabled, required };

  // A per-sensor module carries its own sampling policy, set only while enabled.
  if (sensorType && enabled) {
    moduleEntry.sensorPolicy = {
      '@class': STUDY_SETTING_CLASSES.AndroidSensor,
      sensors: [sensorType],
      samplingRateHz: Number(draft.sensorPolicy?.rateHz),
      dutyCycleActiveSeconds: Number(draft.sensorPolicy?.dutyActive),
      dutyCyclePeriodSeconds: Number(draft.sensorPolicy?.dutyPeriod),
    };
  }

  // interaction_events carries its own InteractionPolicy, set only while enabled.
  if (draft.interaction && enabled) {
    const policy = draft.interaction;
    moduleEntry.interactionPolicy = {
      '@class': STUDY_SETTING_CLASSES.InteractionPolicy,
      gridRows: Number(policy.gridRows),
      gridCols: Number(policy.gridCols),
      captureClicks: policy.captureClicks,
      captureScrolls: policy.captureScrolls,
      captureElementPosition: policy.captureElementPosition,
    };
  }

  // Disabling collection retains the configured cadence for re-enablement.
  if (INTERVAL_CONFIGURABLE_MODULES.has(value) && isCollectionNumber('intervalSeconds', draft.intervalSeconds)) {
    moduleEntry.collectionCadence = {
      intervalSeconds: Number(draft.intervalSeconds),
    };
  }

  applyHealthConnectScope(moduleEntry, form, enabled, value);
  return moduleEntry;
}

export function buildDataCollectionSetting(form: StudyFormData) {
  const problems = collectionNumberValidationProblems(form, createTranslator(getCurrentLanguage()).t);
  if (problems.length) throw new RangeError(problems[0]?.message);
  // A newer server may carry modules this build has never heard of. `modules` is written
  // whole, so rebuilding it from COLLECTION_MODULES alone would delete them on any
  // unrelated edit — carry the loaded entries through untouched first (same reasoning as
  // healthConnectRecordTypes retaining unknown wire ids).
  const known = new Set<string>(COLLECTION_MODULES.map(({ value }) => value));
  const modules: Record<string, Record<string, unknown>> = {};
  for (const [moduleId, entry] of Object.entries(form.loadedModules ?? {})) {
    if (!known.has(moduleId) && entry && typeof entry === 'object' && !Array.isArray(entry)) {
      modules[moduleId] = { ...(entry as Record<string, unknown>) };
    }
  }
  for (const module of COLLECTION_MODULES) {
    modules[module.value] = buildModuleEntry(form, module);
  }

  return {
    '@class': STUDY_SETTING_CLASSES.DataCollection,
    modules,
    // v2 carries the per-module `required` flag (per-module consent design §3.2), matching
    // AndroidDataCollectionSetting.CURRENT_VERSION. The flag rides inside each module entry,
    // so this top-level version is informational (the device diffs by settingVersion).
    version: 2,
  };
}

const LIMIT_FIELDS = ['studyDurationDays', 'dataRetentionDays'] as const;
type StudyLimitField = (typeof LIMIT_FIELDS)[number];
const WHOLE_DAYS = /^[1-9]\d*$/;

/** True when the limit inputs still hold what the form loaded (empty on create). */
export function studyLimitsUnchanged(form: StudyFormData): boolean {
  return LIMIT_FIELDS.every((field) => form[field].trim() === (form.loadedLimits?.[field] ?? ''));
}

/** Limit inputs that are neither empty nor a whole number of days; they are refused, never coerced. */
export function invalidStudyLimitFields(form: StudyFormData): StudyLimitField[] {
  return LIMIT_FIELDS.filter((field) => {
    const value = form[field].trim();
    return value !== '' && !WHOLE_DAYS.test(value);
  });
}

function limitDays(form: StudyFormData, field: StudyLimitField): number | undefined {
  const value = form[field].trim();
  return WHOLE_DAYS.test(value) ? Number(value) : undefined;
}

/** Loaded limits when a duration is untouched, preserving its calendar period and absolute deadline. */
function unchangedDuration(form: StudyFormData, field: StudyLimitField) {
  return form[field].trim() === form.loadedLimits?.[field] ? form.loadedLimits : undefined;
}

/**
 * The limits body. An omitted duration means the study has no end (the researcher sets one or
 * nobody does); an omitted retention takes the server default. Empty inputs give an empty body.
 */
export function buildStudyLimits(form: StudyFormData): Record<string, unknown> {
  const studyDurationDays = limitDays(form, 'studyDurationDays');
  const dataRetentionDays = limitDays(form, 'dataRetentionDays');
  const limits: Record<string, unknown> = {};
  if (studyDurationDays !== undefined) {
    const loaded = unchangedDuration(form, 'studyDurationDays');
    limits.studyDuration = loaded?.studyDuration ?? daysToStudyDuration(studyDurationDays);
    if (loaded?.studyEnds) limits.studyEnds = loaded.studyEnds;
  }
  if (dataRetentionDays !== undefined) {
    const loaded = unchangedDuration(form, 'dataRetentionDays');
    limits.dataRetentionDuration = loaded?.dataRetentionDuration ?? daysToStudyDuration(dataRetentionDays);
    if (loaded?.studyDataExpires && unchangedDuration(form, 'studyDurationDays'))
      limits.studyDataExpires = loaded.studyDataExpires;
  }
  return limits;
}
