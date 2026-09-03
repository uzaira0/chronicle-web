import type { StudyFormData } from '@/components/study-form-dialog';
import { getCurrentLanguage } from '@/i18n/language-context';
import { createTranslator } from '@/i18n/translator';
import {
  COLLECTION_MODULES,
  DEFAULT_DISPOSITION,
  INTERVAL_CONFIGURABLE_MODULES,
  SHARED_QUEUE_MODULES,
} from '@/lib/study-constants';

export function studyDurationToDays(duration: { days: number; months: number; years: number }) {
  return (duration.years || 0) * 365 + (duration.months || 0) * 30 + (duration.days || 0);
}

export function daysToStudyDuration(totalDays: number) {
  const years = Math.floor(totalDays / 365);
  const remaining = totalDays % 365;
  const months = Math.floor(remaining / 30);
  const days = remaining % 30;
  return { years, months, days };
}

export function buildStudyPayload(form: StudyFormData) {
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
    notificationsEnabled: form.notificationsEnabled,
  };
}

export function buildSensorSetting(form: StudyFormData) {
  if (!form.features.includes('ANDROID_SENSOR') || form.selectedSensors.length === 0) {
    return null;
  }

  return {
    '@class': 'com.openlattice.chronicle.android.AndroidSensorSetting' as const,
    sensors: form.selectedSensors,
    samplingRateHz: parseInt(form.samplingRateHz, 10) || 5,
    dutyCycleActiveSeconds: parseInt(form.dutyCycleActiveSeconds, 10) || 30,
    dutyCyclePeriodSeconds: parseInt(form.dutyCyclePeriodSeconds, 10) || 300,
  };
}

export function buildIosSensorSetting(form: StudyFormData, clearWhenDisabled: true): [string, string[]];
export function buildIosSensorSetting(form: StudyFormData, clearWhenDisabled?: false): [string, string[]] | null;
export function buildIosSensorSetting(form: StudyFormData, clearWhenDisabled = false): [string, string[]] | null {
  const enabled = form.features.includes('IOS_SENSOR');
  if (!enabled && !clearWhenDisabled) {
    return null;
  }

  return ['com.openlattice.chronicle.sensorkit.SensorSetting', enabled ? (form.selectedIosSensors ?? []) : []] as [
    string,
    string[],
  ];
}

// A per-sensor hardware module's own sampling rate + duty cycle (per-sensor consent
// redesign), read from the per-sensor form fields with the model defaults (5 Hz / 30 s /
// 300 s). The single owning sensor is named in `sensors`.
function buildPerSensorPolicy(form: StudyFormData, moduleId: string, sensorType: string) {
  return {
    '@class': 'com.openlattice.chronicle.android.AndroidSensorSetting' as const,
    sensors: [sensorType],
    samplingRateHz: parseInt(form.sensorRateHz?.[moduleId] ?? '', 10) || 5,
    dutyCycleActiveSeconds: parseInt(form.sensorDutyActive?.[moduleId] ?? '', 10) || 30,
    dutyCyclePeriodSeconds: parseInt(form.sensorDutyPeriod?.[moduleId] ?? '', 10) || 300,
  };
}

// interaction_events' own InteractionPolicy (grid granularity, clicks/scrolls toggles, and
// whether to capture accessibility-element bounds), read from the interaction form fields with
// the model defaults. The grid and old exact-position flag are compatibility derivations/aliases.
// Element text is never
// captured — content-freeness is a backend constructional invariant, not a configurable field.
function buildInteractionPolicy(form: StudyFormData) {
  return {
    '@class': 'com.openlattice.chronicle.collection.InteractionPolicy' as const,
    gridRows: parseInt(form.interactionGridRows ?? '', 10) || 4,
    gridCols: parseInt(form.interactionGridCols ?? '', 10) || 3,
    captureClicks: form.interactionCaptureClicks ?? true,
    captureScrolls: form.interactionCaptureScrolls ?? true,
    captureExactPosition: form.interactionCaptureExactPosition ?? true,
    captureElementPosition: form.interactionCaptureExactPosition ?? true,
  };
}

// A pull/periodic module's own collection interval. CollectionCadence is a PLAIN object — it is
// NOT a polymorphic StudySetting subtype and has no @JsonIgnoreProperties(ignoreUnknown), so it
// must carry NO `@class` (a stray one would break backend deserialization). Only intervalSeconds
// is sent (defaulting to the 15-min floor); jitterSeconds is intentionally omitted.
function buildCollectionCadence(form: StudyFormData, moduleId: string): { intervalSeconds: number } {
  return { intervalSeconds: parseInt(form.moduleIntervalSeconds?.[moduleId] ?? '', 10) || 900 };
}

function applyHealthConnectScope(
  moduleEntry: Record<string, unknown>,
  form: StudyFormData,
  enabled: boolean,
  moduleId: (typeof COLLECTION_MODULES)[number]['value'],
) {
  if (moduleId !== 'health_connect') return;
  const selectedRecordTypes = [...new Set((form.healthConnectRecordTypes ?? []).filter((recordType) => recordType))];
  if (enabled && selectedRecordTypes.length === 0) {
    throw new Error(createTranslator(getCurrentLanguage()).t('study_form.hc_scope_error'));
  }
  // Disabled means no approved scope. Sending an explicit empty list prevents a
  // previously selected scope from surviving a disable/re-enable cycle unnoticed.
  moduleEntry.healthConnectRecordTypes = enabled ? selectedRecordTypes : [];
}

function applyDisableDisposition(
  moduleEntry: Record<string, unknown>,
  form: StudyFormData,
  enabled: boolean,
  moduleId: (typeof COLLECTION_MODULES)[number]['value'],
) {
  if (enabled) return;
  const chosen = form.moduleDispositions?.[moduleId] ?? DEFAULT_DISPOSITION;
  // Shared-queue modules (usage_events / device_lifecycle) cannot honor DISCARD — the
  // device drains their merged `dataQueue` module-blind — so never emit it for them even
  // from stale form state; coerce to the no-loss default. (See study-constants
  // SHARED_QUEUE_MODULES + collection loop closure design §7.1.)
  moduleEntry.disableDisposition =
    SHARED_QUEUE_MODULES.has(moduleId) && chosen === 'discard_and_stop' ? DEFAULT_DISPOSITION : chosen;
}

// Build the wire entry for a single collection module from the form state. Extracted from
// buildDataCollectionSetting to keep that function's branching within complexity limits.
function buildModuleEntry(form: StudyFormData, module: (typeof COLLECTION_MODULES)[number]): Record<string, unknown> {
  const { value, defaultEnabled, sensorType } = module;
  // `enabled` is always sent explicitly — the backend CollectionModuleSetting has no
  // default for it. `required` (per-module consent design §3.1) is meaningful only while
  // enabled, but is always sent (mirrors `enabled`, keeps the write idempotent); defaults
  // optional (false), and a disabled module is never required.
  const enabled = form.moduleSettings?.[value] ?? defaultEnabled;
  const required = enabled ? (form.moduleRequired?.[value] ?? false) : false;
  const moduleEntry: Record<string, unknown> = { enabled, required };

  // A per-sensor module carries its own sampling policy, set only while enabled.
  if (sensorType && enabled) {
    moduleEntry.sensorPolicy = buildPerSensorPolicy(form, value, sensorType);
  }

  // interaction_events carries its own InteractionPolicy, set only while enabled.
  if (value === 'interaction_events' && enabled) {
    moduleEntry.interactionPolicy = buildInteractionPolicy(form);
  }

  // The pull/periodic modules carry their own collection interval, set only while enabled.
  if (enabled && INTERVAL_CONFIGURABLE_MODULES.has(value)) {
    moduleEntry.collectionCadence = buildCollectionCadence(form, value);
  }

  applyHealthConnectScope(moduleEntry, form, enabled, value);
  // The disable disposition is meaningful only while the module is OFF. Sending it
  // exclusively in the disabled case clears it (back to null) on re-enable — the device
  // acts on it only on the ACTIVE -> INACTIVE transition.
  applyDisableDisposition(moduleEntry, form, enabled, value);
  return moduleEntry;
}

export function buildDataCollectionSetting(form: StudyFormData) {
  // Per-module enable/disable is the configuration of the Android data collection
  // feature; only write it when that feature is selected (mirrors buildSensorSetting).
  if (!form.features.includes('CHRONICLE_DATA_COLLECTION')) {
    return null;
  }

  const modules: Record<string, Record<string, unknown>> = {};
  for (const module of COLLECTION_MODULES) {
    modules[module.value] = buildModuleEntry(form, module);
  }

  return {
    '@class': 'com.openlattice.chronicle.collection.AndroidDataCollectionSetting' as const,
    modules,
    // v2 carries the per-module `required` flag (per-module consent design §3.2), matching
    // AndroidDataCollectionSetting.CURRENT_VERSION. The flag rides inside each module entry,
    // so this top-level version is informational (the device diffs by settingVersion).
    version: 2,
  };
}

export function buildStudyLimits(form: StudyFormData) {
  const participantLimit = parseInt(form.participantLimit, 10);
  const studyDurationDays = parseInt(form.studyDurationDays, 10);
  const dataRetentionDays = parseInt(form.dataRetentionDays, 10);

  if (!(participantLimit > 0) && !(studyDurationDays > 0) && !(dataRetentionDays > 0)) {
    return null;
  }

  const limits: Record<string, unknown> = {};
  if (participantLimit > 0) limits.participantLimit = participantLimit;
  if (studyDurationDays > 0) limits.studyDuration = daysToStudyDuration(studyDurationDays);
  if (dataRetentionDays > 0) limits.dataRetentionDuration = daysToStudyDuration(dataRetentionDays);
  return limits;
}
