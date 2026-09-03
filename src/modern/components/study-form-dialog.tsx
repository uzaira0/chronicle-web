import { LoaderCircle, Pencil, Plus } from 'lucide-react';
import { type Dispatch, type FormEvent, type SetStateAction, useEffect, useRef, useState } from 'react';

import { StudyParticipantPolicyFields } from '@/components/study-participant-policy-fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FieldHint } from '@/components/ui/field-hint';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { translateCatalog, useTranslator } from '@/i18n';
import { isValidEmail } from '@/lib/data-validation';
import { getErrorMessage } from '@/lib/errors';
import {
  EMPTY_PARTICIPANT_POLICY_FORM,
  type ParticipantPolicyForm,
  participantPolicyToForm,
  validateParticipantPolicy,
} from '@/lib/participant-policy';
import {
  COLLECTION_MODULE_GROUP_ORDER,
  COLLECTION_MODULES,
  type CollectionDataDisposition,
  DEFAULT_COLLECTION_INTERVAL_SECONDS,
  DEFAULT_DISPOSITION,
  DEFAULT_SENSOR_DUTY_ACTIVE,
  DEFAULT_SENSOR_DUTY_PERIOD,
  DEFAULT_SENSOR_RATE_HZ,
  dispositionsForModule,
  HEALTH_CONNECT_RECORD_TYPES,
  INTERVAL_CONFIGURABLE_MODULES,
  IOS_SENSOR_TYPES,
  isKnownHealthConnectRecordType,
  STUDY_FEATURES,
} from '@/lib/study-constants';
import { studyDurationToDays } from '@/lib/study-form-helpers';
import { cn } from '@/lib/utils';
import {
  type DataCollectionSettingSummary,
  type StudyLimits,
  type StudySummary,
  useGetStudyDataCollectionSettingQuery,
  useGetStudyLimitsQuery,
  useGetStudySettingsQuery,
} from '@/state/study-operations-api';

type StudyFormData = {
  contact: string;
  dataRetentionDays: string;
  description: string;
  dutyCycleActiveSeconds: string;
  dutyCyclePeriodSeconds: string;
  features: string[];
  group: string;
  // Exact Health Connect wire ids. Unknown future ids are retained so editing an
  // unrelated field with an older web build cannot silently narrow approved scope.
  healthConnectRecordTypes?: string[];
  // Per-active-module disable disposition (keyed by CollectionModuleId). Only
  // consulted for a module whose toggle is OFF; the write path sends it solely in the
  // disabled case (so re-enabling clears it). Defaults to DEFAULT_DISPOSITION.
  moduleDispositions?: Record<string, CollectionDataDisposition>;
  // Per-active-module enablement (keyed by CollectionModuleId). Always populated by
  // getInitialFormData; optional only so the helper test fixtures (which predate this
  // field and build a StudyFormData without it) keep type-checking.
  moduleSettings?: Record<string, boolean>;
  // Per-active-module "required for participation" flag (keyed by CollectionModuleId).
  // Meaningful only when the module is enabled; the enrollment wizard makes a required
  // module mandatory to accept and locks it in the on-device Data Sharing surface.
  // Optional (false) is the default. Optional like moduleSettings for the same reason.
  moduleRequired?: Record<string, boolean>;
  notificationsEnabled: boolean;
  participantPolicy?: ParticipantPolicyForm;
  participantLimit: string;
  samplingRateHz: string;
  selectedIosSensors?: string[];
  selectedSensors: string[];
  // Per-sensor module sampling config (keyed by sensor CollectionModuleId): each sensor's
  // own rate (Hz) and duty cycle, edited per sensor module. Optional like moduleSettings so
  // the helper test fixtures (which predate them) keep type-checking.
  sensorRateHz?: Record<string, string>;
  sensorDutyActive?: Record<string, string>;
  sensorDutyPeriod?: Record<string, string>;
  // Per-module collection interval (seconds), keyed by CollectionModuleId. Meaningful only
  // for INTERVAL_CONFIGURABLE_MODULES (the pull/periodic modules); seeded for all but the
  // write path only emits it for those modules. Optional like moduleSettings so the helper
  // test fixtures (which predate it) keep type-checking.
  moduleIntervalSeconds?: Record<string, string>;
  // interaction_events' own InteractionPolicy: screen-region grid granularity + which
  // interaction kinds to record. Top-level scalar fields (interaction_events is a single
  // module, unlike the per-sensor maps). Optional so helper test fixtures keep type-checking.
  interactionGridRows?: string;
  interactionGridCols?: string;
  interactionCaptureClicks?: boolean;
  interactionCaptureScrolls?: boolean;
  interactionCaptureExactPosition?: boolean;
  studyDurationDays: string;
  title: string;
  version: string;
};

// A collection module is in exactly one of three states from the study's point of view.
// `disabled` is not collected at all; `optional` is offered and the participant may decline;
// `required` must be accepted to enroll. Stored as the (enabled, required) pair on the wire.
type ModuleMode = 'disabled' | 'optional' | 'required';

// Each mode gets its own selected colour. They previously shared one solid-primary
// treatment, so a module set to Disabled looked identical to one set to Optional — the
// same "on" green standing for opposite meanings, which is unreadable at a glance across
// 31 rows. Off-states must not look positive.
const MODULE_MODES: ReadonlyArray<{ hintKey: string; labelKey: string; selectedClass: string; value: ModuleMode }> = [
  {
    value: 'required',
    labelKey: 'study_form.mode_required',
    hintKey: 'study_form.mode_required_hint',
    selectedClass: 'bg-primary text-primary-foreground',
  },
  {
    value: 'optional',
    labelKey: 'study_form.mode_optional',
    hintKey: 'study_form.mode_optional_hint',
    selectedClass: 'bg-[var(--eq-info-bg)] text-[var(--eq-info)]',
  },
  {
    value: 'disabled',
    labelKey: 'study_form.mode_disabled',
    hintKey: 'study_form.mode_disabled_hint',
    selectedClass: 'bg-muted text-foreground',
  },
];

/** Three-way segmented selector for a module's required/optional/disabled state. */
function ModuleModeControl({
  label,
  mode,
  onChange,
}: {
  label: string;
  mode: ModuleMode;
  onChange: (mode: ModuleMode) => void;
}) {
  // Real radio inputs (visually hidden, styled labels) rather than buttons: the group gets
  // native arrow-key navigation and screen-reader semantics for free.
  const groupName = `module-mode-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const { t } = useTranslator();
  return (
    <fieldset className="flex shrink-0 overflow-hidden rounded-md border border-border">
      <legend className="sr-only">{t('study_form.mode_legend', { label })}</legend>
      {MODULE_MODES.map(({ hintKey, labelKey, selectedClass, value }) => {
        const selected = mode === value;
        return (
          <label
            className={cn(
              'cursor-pointer px-3.5 py-2 text-sm',
              selected ? `font-medium ${selectedClass}` : 'bg-transparent text-muted-foreground hover:bg-muted',
            )}
            key={value}
            title={t(hintKey)}
          >
            <input
              checked={selected}
              className="sr-only"
              name={groupName}
              onChange={() => onChange(value)}
              type="radio"
              value={value}
            />
            {t(labelKey)}
          </label>
        );
      })}
    </fieldset>
  );
}

// interaction_events config plumbing (mirrors the per-sensor config handler shape).
type InteractionConfigField = 'gridRows' | 'gridCols' | 'captureClicks' | 'captureScrolls' | 'captureExactPosition';
type InteractionConfig = {
  gridRows: string;
  gridCols: string;
  captureClicks: boolean;
  captureScrolls: boolean;
  captureExactPosition: boolean;
};

// Maps an interaction config control to its (flat scalar) StudyFormData field. Module-level
// so the dialog's change handler stays a one-liner (keeps its cognitive complexity in budget).
const INTERACTION_FIELD_TO_FORM_KEY: Record<InteractionConfigField, keyof StudyFormData> = {
  gridRows: 'interactionGridRows',
  gridCols: 'interactionGridCols',
  captureClicks: 'interactionCaptureClicks',
  captureScrolls: 'interactionCaptureScrolls',
  captureExactPosition: 'interactionCaptureExactPosition',
};

// Maps a per-sensor config control to its (keyed-map) StudyFormData field. Module-level so the
// dialog's change handler stays a one-liner (keeps its cognitive complexity in budget).
const SENSOR_FIELD_TO_FORM_KEY: Record<
  'active' | 'period' | 'rate',
  'sensorDutyActive' | 'sensorDutyPeriod' | 'sensorRateHz'
> = {
  rate: 'sensorRateHz',
  active: 'sensorDutyActive',
  period: 'sensorDutyPeriod',
};

// Builds interaction_events' config change handler outside the component body so the dialog's
// in-component handler is a plain assignment (keeps its cognitive complexity within budget).
function makeInteractionConfigHandler(
  setForm: Dispatch<SetStateAction<StudyFormData>>,
): (field: InteractionConfigField, value: string | boolean) => void {
  return (field, value) => setForm((prev) => ({ ...prev, [INTERACTION_FIELD_TO_FORM_KEY[field]]: value }));
}

// Resolve the interaction config (with model defaults) from form state. Module-level so the
// defaulting (??) stays out of the component body's cognitive-complexity budget.
function toInteractionConfig(form: StudyFormData): InteractionConfig {
  return {
    gridRows: form.interactionGridRows ?? '4',
    gridCols: form.interactionGridCols ?? '3',
    captureClicks: form.interactionCaptureClicks ?? true,
    captureScrolls: form.interactionCaptureScrolls ?? true,
    captureExactPosition: form.interactionCaptureExactPosition ?? true,
  };
}

// Resolve each active module's enablement: the study's current DataCollection
// setting wins; otherwise fall back to the module's privacy-class default.
function initialModuleSettings(dataCollection?: DataCollectionSettingSummary): Record<string, boolean> {
  const moduleSettings: Record<string, boolean> = {};
  for (const { value, defaultEnabled } of COLLECTION_MODULES) {
    moduleSettings[value] = dataCollection?.modules?.[value]?.enabled ?? defaultEnabled;
  }
  return moduleSettings;
}

// Resolve each active module's "required for participation" flag: the study's current
// DataCollection setting wins; otherwise default optional (false). A required flag is
// only meaningful for an enabled module.
function initialModuleRequired(dataCollection?: DataCollectionSettingSummary): Record<string, boolean> {
  const moduleRequired: Record<string, boolean> = {};
  for (const { value } of COLLECTION_MODULES) {
    moduleRequired[value] = dataCollection?.modules?.[value]?.required ?? false;
  }
  return moduleRequired;
}

// Seed each module's disable disposition from the study's current setting (a
// previously-disabled module may already carry one); default the rest. Only used
// when the module is OFF.
function initialModuleDispositions(
  dataCollection?: DataCollectionSettingSummary,
): Record<string, CollectionDataDisposition> {
  const dispositions: Record<string, CollectionDataDisposition> = {};
  for (const { value } of COLLECTION_MODULES) {
    const stored = dataCollection?.modules?.[value]?.disableDisposition;
    dispositions[value] =
      stored === 'flush_then_stop' || stored === 'discard_and_stop' || stored === 'hold_pending'
        ? stored
        : DEFAULT_DISPOSITION;
  }
  return dispositions;
}

// Seed each per-sensor module's rate + duty cycle from the study's current DataCollection
// setting (its module's sensorPolicy), or the model defaults (5 Hz / 30 s / 300 s).
function initialSensorPolicies(dataCollection?: DataCollectionSettingSummary): {
  sensorDutyActive: Record<string, string>;
  sensorDutyPeriod: Record<string, string>;
  sensorRateHz: Record<string, string>;
} {
  const sensorRateHz: Record<string, string> = {};
  const sensorDutyActive: Record<string, string> = {};
  const sensorDutyPeriod: Record<string, string> = {};
  for (const module of COLLECTION_MODULES) {
    if (!module.sensorType) continue;
    const policy = dataCollection?.modules?.[module.value]?.sensorPolicy as
      | { dutyCycleActiveSeconds?: number; dutyCyclePeriodSeconds?: number; samplingRateHz?: number }
      | undefined;
    sensorRateHz[module.value] = policy?.samplingRateHz?.toString() ?? DEFAULT_SENSOR_RATE_HZ;
    sensorDutyActive[module.value] = policy?.dutyCycleActiveSeconds?.toString() ?? DEFAULT_SENSOR_DUTY_ACTIVE;
    sensorDutyPeriod[module.value] = policy?.dutyCyclePeriodSeconds?.toString() ?? DEFAULT_SENSOR_DUTY_PERIOD;
  }
  return { sensorRateHz, sensorDutyActive, sensorDutyPeriod };
}

// Seed each module's collection interval from the study's current DataCollection setting
// (its module's collectionCadence.intervalSeconds), or the 15-min default. Only meaningful for
// INTERVAL_CONFIGURABLE_MODULES, but seeding every module is harmless (the write path emits it
// only for those modules).
function initialModuleIntervals(dataCollection?: DataCollectionSettingSummary): Record<string, string> {
  const moduleIntervalSeconds: Record<string, string> = {};
  for (const { value } of COLLECTION_MODULES) {
    const cadence = dataCollection?.modules?.[value]?.collectionCadence as { intervalSeconds?: number } | undefined;
    moduleIntervalSeconds[value] = cadence?.intervalSeconds?.toString() ?? DEFAULT_COLLECTION_INTERVAL_SECONDS;
  }
  return moduleIntervalSeconds;
}

// Seed interaction_events' grid + capture toggles from the study's current DataCollection
// setting (its interactionPolicy), or the model defaults (4x3 grid, clicks + scrolls on,
// accessibility-element bounds captured; the grid remains a legacy compatibility derivation).
function initialInteractionPolicy(dataCollection?: DataCollectionSettingSummary): {
  interactionGridRows: string;
  interactionGridCols: string;
  interactionCaptureClicks: boolean;
  interactionCaptureScrolls: boolean;
  interactionCaptureExactPosition: boolean;
} {
  const policy = dataCollection?.modules?.interaction_events?.interactionPolicy as
    | {
        gridRows?: number;
        gridCols?: number;
        captureClicks?: boolean;
        captureScrolls?: boolean;
        captureExactPosition?: boolean;
        captureElementPosition?: boolean;
      }
    | undefined;
  return {
    interactionGridRows: policy?.gridRows?.toString() ?? '4',
    interactionGridCols: policy?.gridCols?.toString() ?? '3',
    interactionCaptureClicks: policy?.captureClicks ?? true,
    interactionCaptureScrolls: policy?.captureScrolls ?? true,
    interactionCaptureExactPosition: policy?.captureElementPosition ?? policy?.captureExactPosition ?? true,
  };
}

function initialHealthConnectRecordTypes(dataCollection?: DataCollectionSettingSummary): string[] {
  const recordTypes = dataCollection?.modules?.health_connect?.healthConnectRecordTypes;
  return Array.isArray(recordTypes)
    ? [...new Set(recordTypes.filter((recordType): recordType is string => typeof recordType === 'string'))]
    : [];
}

function getInitialFormData(
  study?: StudySummary,
  limits?: StudyLimits,
  dataCollection?: DataCollectionSettingSummary,
  participantPolicy?: unknown,
): StudyFormData {
  // A new study starts with data collection selected. The Data Collection Modules
  // section only renders when this feature is on, so an empty default meant creating a
  // study, seeing no modules anywhere, and having no way to tell that a chip above was
  // what hid them.
  const modules = study?.modules ? Object.keys(study.modules) : ['CHRONICLE_DATA_COLLECTION'];
  const sensorSettings = study?.settings?.AndroidSensor;
  const iosSensorSettings = study?.settings?.Sensor;
  const offeredIosSensors = new Set<string>(IOS_SENSOR_TYPES.map(({ value }) => value));
  const selectedIosSensors = Array.isArray(iosSensorSettings?.[1])
    ? iosSensorSettings[1].filter(
        (sensor): sensor is string => typeof sensor === 'string' && offeredIosSensors.has(sensor),
      )
    : [];

  const participantLimit = limits?.participantLimit ? String(limits.participantLimit) : '';
  const studyDurationDays = limits?.studyDuration ? String(studyDurationToDays(limits.studyDuration)) : '';
  const dataRetentionDays = limits?.dataRetentionDuration
    ? String(studyDurationToDays(limits.dataRetentionDuration))
    : '';

  return {
    contact: study?.contact || '',
    dataRetentionDays,
    description: study?.description || '',
    dutyCycleActiveSeconds: sensorSettings?.dutyCycleActiveSeconds?.toString() || '30',
    dutyCyclePeriodSeconds: sensorSettings?.dutyCyclePeriodSeconds?.toString() || '300',
    features: modules,
    group: study?.group || '',
    healthConnectRecordTypes: initialHealthConnectRecordTypes(dataCollection),
    moduleDispositions: initialModuleDispositions(dataCollection),
    moduleIntervalSeconds: initialModuleIntervals(dataCollection),
    moduleRequired: initialModuleRequired(dataCollection),
    moduleSettings: initialModuleSettings(dataCollection),
    notificationsEnabled: study?.notificationsEnabled || false,
    participantPolicy: participantPolicyToForm(participantPolicy),
    participantLimit,
    samplingRateHz: sensorSettings?.samplingRateHz?.toString() || '5',
    selectedIosSensors,
    selectedSensors: sensorSettings?.sensors || [],
    ...initialSensorPolicies(dataCollection),
    ...initialInteractionPolicy(dataCollection),
    studyDurationDays,
    title: study?.title || '',
    version: study?.version || '',
  };
}

type StudyFormDialogProps = {
  mode: 'create' | 'edit';
  onSubmit: (data: StudyFormData) => Promise<void>;
  study?: StudySummary;
};

export type { StudyFormData };

function isFormComplete(form: StudyFormData): boolean {
  const iosSensorSelectionComplete =
    !form.features.includes('IOS_SENSOR') || (form.selectedIosSensors?.length ?? 0) > 0;
  const participantPolicyComplete =
    Object.keys(validateParticipantPolicy(form.participantPolicy ?? EMPTY_PARTICIPANT_POLICY_FORM)).length === 0;
  const healthConnectScopeComplete =
    !(form.moduleSettings?.health_connect ?? false) || (form.healthConnectRecordTypes?.length ?? 0) > 0;
  return (
    form.title.trim().length > 0 &&
    form.features.length > 0 &&
    isValidEmail(form.contact) &&
    iosSensorSelectionComplete &&
    participantPolicyComplete &&
    healthConnectScopeComplete
  );
}

function toggleInArray(values: string[], item: string): string[] {
  return values.includes(item) ? values.filter((v) => v !== item) : [...values, item];
}

function submitButtonKey(mode: 'create' | 'edit', isSubmitting: boolean): string {
  if (isSubmitting) {
    return mode === 'create' ? 'study_form.creating' : 'study_form.saving';
  }
  return mode === 'create' ? 'study_form.create' : 'study_form.save_changes';
}

function submitFailureKey(mode: 'create' | 'edit'): string {
  return mode === 'create' ? 'study_form.create_failed' : 'study_form.save_failed';
}

function shouldSkipStudyReads(mode: 'create' | 'edit', studyId: string | undefined, open: boolean): boolean {
  return mode !== 'edit' || !studyId || !open;
}

type StudyReadState = 'failed' | 'pending' | 'ready';

function resolveStudyReadState(
  mode: 'create' | 'edit',
  fetching: readonly boolean[],
  failed: readonly boolean[],
): StudyReadState {
  if (mode !== 'edit') return 'ready';
  if (fetching.some(Boolean)) return 'pending';
  return failed.some(Boolean) ? 'failed' : 'ready';
}

function toggleHealthConnectScope(current: string[], recordType: string): string[] {
  const selected = new Set(current);
  if (selected.has(recordType)) selected.delete(recordType);
  else selected.add(recordType);
  const orderedKnown = HEALTH_CONNECT_RECORD_TYPES.map(({ value }) => value).filter((value) => selected.has(value));
  const preservedUnknown = current.filter((value) => !isKnownHealthConnectRecordType(value) && selected.has(value));
  return [...orderedKnown, ...preservedUnknown];
}

function StudyDialogTrigger({ mode }: { mode: 'create' | 'edit' }) {
  const { t } = useTranslator();
  return (
    <DialogTrigger asChild>
      {mode === 'create' ? (
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('study_form.create_new')}
        </Button>
      ) : (
        <Button id="edit-study-trigger" size="sm" variant="outline">
          <Pencil className="mr-2 h-4 w-4" />
          {t('study_form.edit')}
        </Button>
      )}
    </DialogTrigger>
  );
}

function HealthConnectScopeControl({
  selected,
  onToggle,
}: {
  onToggle: (recordType: string) => void;
  selected: string[];
}) {
  const selectedSet = new Set(selected);
  const unknownRecordTypes = selected.filter((recordType) => !isKnownHealthConnectRecordType(recordType));
  const { t } = useTranslator();
  return (
    <fieldset aria-invalid={selected.length === 0} className="space-y-3 border-t border-border/40 pt-3">
      <legend className="text-sm font-medium">{t('study_form.hc_legend')}</legend>
      <p className="text-xs text-muted-foreground">{t('study_form.hc_description')}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {HEALTH_CONNECT_RECORD_TYPES.map(({ label, value }) => (
          <label className="flex items-center gap-2 text-sm" htmlFor={`health-connect-${value}`} key={value}>
            <input
              checked={selectedSet.has(value)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              id={`health-connect-${value}`}
              onChange={() => onToggle(value)}
              type="checkbox"
            />
            {translateCatalog(t, 'health_connect', value, label)}
          </label>
        ))}
      </div>
      {unknownRecordTypes.length > 0 && (
        <div className="rounded-md border border-amber-500/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-400">
          {t('study_form.hc_unknown_types', { types: unknownRecordTypes.join(', ') })}
        </div>
      )}
      {selected.length === 0 && (
        <div className="space-y-1 text-xs text-destructive">
          <p>{t('study_form.hc_select_one')}</p>
          <p>{t('study_form.hc_none_selected')}</p>
        </div>
      )}
    </fieldset>
  );
}

// One module's row in the Data Collection section: On/Off, Required/Optional (only when
// enabled), and the disable-disposition picker (only mid-study when turning a module off).
// Extracted from the section so the section's map callback stays within complexity limits.
function DataCollectionModuleRow({
  module,
  mode,
  enabled,
  required,
  disposition,
  sensorConfig,
  interactionConfig,
  healthConnectRecordTypes,
  intervalSeconds,
  onSetMode,
  onDispositionChange,
  onSensorConfigChange,
  onInteractionConfigChange,
  onHealthConnectRecordTypeToggle,
  onModuleIntervalChange,
}: {
  module: (typeof COLLECTION_MODULES)[number];
  mode: 'create' | 'edit';
  enabled: boolean;
  required: boolean;
  disposition: CollectionDataDisposition;
  sensorConfig: { dutyActive: string; dutyPeriod: string; rateHz: string };
  interactionConfig: InteractionConfig;
  healthConnectRecordTypes: string[];
  intervalSeconds: string;
  onDispositionChange: (moduleId: string, disposition: CollectionDataDisposition) => void;
  onSensorConfigChange: (moduleId: string, field: 'active' | 'period' | 'rate', value: string) => void;
  onInteractionConfigChange: (field: InteractionConfigField, value: string | boolean) => void;
  onHealthConnectRecordTypeToggle: (recordType: string) => void;
  onModuleIntervalChange: (moduleId: string, value: string) => void;
  onSetMode: (moduleId: string, mode: ModuleMode) => void;
}) {
  const { value, sensorType } = module;
  const { t } = useTranslator();
  const label = translateCatalog(t, 'module', value, module.label);
  const description = translateCatalog(t, 'module_description', value, module.description);
  const privacyClass = translateCatalog(t, 'privacy_class', module.privacyClass, module.privacyClass);
  const isInteraction = value === 'interaction_events';
  // The interval control is for the pull/periodic modules only (never a per-sensor module —
  // sensors keep their rate/duty UI).
  const showInterval = enabled && !sensorType && INTERVAL_CONFIGURABLE_MODULES.has(value);
  const showHealthConnectWarning = value === 'health_connect' && enabled;
  // The disposition only matters when disabling a module that may already have collected
  // data on-device — i.e. a mid-study (edit-mode) turn-off.
  const showDisposition = mode === 'edit' && !enabled;
  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{label}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{privacyClass}</span>
          </div>
          {/* Clamped, with the full text on hover. Thirty-one modules each carrying a
              two-to-three-line paragraph is most of this dialog's height, and the
              paragraph is reference material — you read one, not all of them. */}
          <p className="line-clamp-1 text-xs text-muted-foreground" title={description}>
            {description}
          </p>
        </div>
        <ModuleModeControl
          label={label}
          mode={enabled ? (required ? 'required' : 'optional') : 'disabled'}
          onChange={(next) => onSetMode(value, next)}
        />
      </div>
      {sensorType && enabled && (
        <div className="grid gap-4 border-t border-border/40 pt-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground" htmlFor={`rate-${value}`}>
              {t('study_form.sampling_rate')}
            </Label>
            <Input
              id={`rate-${value}`}
              max={200}
              min={1}
              onChange={(e) => onSensorConfigChange(value, 'rate', e.target.value)}
              type="number"
              value={sensorConfig.rateHz}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground" htmlFor={`active-${value}`}>
              {t('study_form.duty_active')}
            </Label>
            <Input
              id={`active-${value}`}
              min={1}
              onChange={(e) => onSensorConfigChange(value, 'active', e.target.value)}
              type="number"
              value={sensorConfig.dutyActive}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground" htmlFor={`period-${value}`}>
              {t('study_form.duty_period')}
            </Label>
            <Input
              id={`period-${value}`}
              min={1}
              onChange={(e) => onSensorConfigChange(value, 'period', e.target.value)}
              type="number"
              value={sensorConfig.dutyPeriod}
            />
          </div>
        </div>
      )}
      {showInterval && (
        <div className="border-t border-border/40 pt-3">
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground" htmlFor={`interval-${value}`}>
              {t('study_form.collection_interval')}
            </Label>
            <Input
              id={`interval-${value}`}
              min={60}
              onChange={(e) => onModuleIntervalChange(value, e.target.value)}
              type="number"
              value={intervalSeconds}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{t('study_form.interval_hint')}</p>
        </div>
      )}
      {showHealthConnectWarning && (
        <>
          <HealthConnectScopeControl onToggle={onHealthConnectRecordTypeToggle} selected={healthConnectRecordTypes} />
          <div className="rounded-md border border-amber-500/50 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-400">
            {t('study_form.hc_warning')}
          </div>
        </>
      )}
      {isInteraction && enabled && (
        <div className="space-y-3 border-t border-border/40 pt-3">
          <p className="text-xs font-medium text-muted-foreground">{t('study_form.legacy_grid')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground" htmlFor={`grid-rows-${value}`}>
                {t('study_form.grid_rows')}
              </Label>
              <Input
                id={`grid-rows-${value}`}
                max={20}
                min={1}
                onChange={(e) => onInteractionConfigChange('gridRows', e.target.value)}
                type="number"
                value={interactionConfig.gridRows}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground" htmlFor={`grid-cols-${value}`}>
                {t('study_form.grid_cols')}
              </Label>
              <Input
                id={`grid-cols-${value}`}
                max={20}
                min={1}
                onChange={(e) => onInteractionConfigChange('gridCols', e.target.value)}
                type="number"
                value={interactionConfig.gridCols}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm text-muted-foreground" htmlFor={`clicks-${value}`}>
              <input
                checked={interactionConfig.captureClicks}
                className="h-4 w-4"
                id={`clicks-${value}`}
                onChange={(e) => onInteractionConfigChange('captureClicks', e.target.checked)}
                type="checkbox"
              />
              {t('study_form.capture_clicks')}
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground" htmlFor={`scrolls-${value}`}>
              <input
                checked={interactionConfig.captureScrolls}
                className="h-4 w-4"
                id={`scrolls-${value}`}
                onChange={(e) => onInteractionConfigChange('captureScrolls', e.target.checked)}
                type="checkbox"
              />
              {t('study_form.capture_scrolls')}
            </label>
            <label
              className="flex items-center gap-2 text-sm text-muted-foreground"
              htmlFor={`exact-position-${value}`}
            >
              <input
                checked={interactionConfig.captureExactPosition}
                className="h-4 w-4"
                id={`exact-position-${value}`}
                onChange={(e) => onInteractionConfigChange('captureExactPosition', e.target.checked)}
                type="checkbox"
              />
              {t('study_form.capture_bounds')}
            </label>
          </div>
          <p className="text-xs text-muted-foreground">{t('study_form.interaction_note')}</p>
        </div>
      )}
      {showDisposition && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border/40 pt-3">
          <Label className="text-sm text-muted-foreground" htmlFor={`disposition-${value}`}>
            {t('study_form.on_disable')}
          </Label>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            id={`disposition-${value}`}
            onChange={(e) => onDispositionChange(value, e.target.value as CollectionDataDisposition)}
            value={disposition}
          >
            {dispositionsForModule(value).map((d) => (
              <option
                key={d.value}
                title={translateCatalog(t, 'disposition_description', d.value, d.description)}
                value={d.value}
              >
                {translateCatalog(t, 'disposition', d.value, d.label)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// The form-state maps + handlers a DataCollectionModuleRow needs, bundled so the section and
// its per-group children thread one prop instead of a dozen (keeps each component's signature
// and the map callbacks within the complexity budget).
type DataCollectionRowContext = {
  healthConnectRecordTypes: string[];
  mode: 'create' | 'edit';
  moduleDispositions: Record<string, CollectionDataDisposition> | undefined;
  moduleRequired: Record<string, boolean> | undefined;
  moduleSettings: Record<string, boolean> | undefined;
  sensorRateHz: Record<string, string> | undefined;
  sensorDutyActive: Record<string, string> | undefined;
  sensorDutyPeriod: Record<string, string> | undefined;
  moduleIntervalSeconds: Record<string, string> | undefined;
  interactionConfig: InteractionConfig;
  onDispositionChange: (moduleId: string, disposition: CollectionDataDisposition) => void;
  onHealthConnectRecordTypeToggle: (recordType: string) => void;
  onSensorConfigChange: (moduleId: string, field: 'active' | 'period' | 'rate', value: string) => void;
  onInteractionConfigChange: (field: InteractionConfigField, value: string | boolean) => void;
  onModuleIntervalChange: (moduleId: string, value: string) => void;
  onSetMode: (moduleId: string, mode: ModuleMode) => void;
};

// Render one module's row from the shared context. Module-level so the group's map callback
// stays a one-liner (keeps its cognitive complexity in budget).
function renderModuleRow(module: (typeof COLLECTION_MODULES)[number], ctx: DataCollectionRowContext) {
  const enabled = ctx.moduleSettings?.[module.value] ?? false;
  return (
    <DataCollectionModuleRow
      disposition={ctx.moduleDispositions?.[module.value] ?? DEFAULT_DISPOSITION}
      enabled={enabled}
      healthConnectRecordTypes={ctx.healthConnectRecordTypes}
      interactionConfig={ctx.interactionConfig}
      intervalSeconds={ctx.moduleIntervalSeconds?.[module.value] ?? DEFAULT_COLLECTION_INTERVAL_SECONDS}
      key={module.value}
      mode={ctx.mode}
      module={module}
      onDispositionChange={ctx.onDispositionChange}
      onHealthConnectRecordTypeToggle={ctx.onHealthConnectRecordTypeToggle}
      onInteractionConfigChange={ctx.onInteractionConfigChange}
      onModuleIntervalChange={ctx.onModuleIntervalChange}
      onSensorConfigChange={ctx.onSensorConfigChange}
      onSetMode={ctx.onSetMode}
      required={enabled && (ctx.moduleRequired?.[module.value] ?? false)}
      sensorConfig={{
        dutyActive: ctx.sensorDutyActive?.[module.value] ?? DEFAULT_SENSOR_DUTY_ACTIVE,
        dutyPeriod: ctx.sensorDutyPeriod?.[module.value] ?? DEFAULT_SENSOR_DUTY_PERIOD,
        rateHz: ctx.sensorRateHz?.[module.value] ?? DEFAULT_SENSOR_RATE_HZ,
      }}
    />
  );
}

// One collapsible signal group: a native <details>/<summary> styled to match the form. The
// summary shows the group label + a count of enabled modules; the group opens by default when
// any of its modules is enabled so existing config stays visible.
function DataCollectionModuleGroup({
  group,
  modules,
  ctx,
}: {
  group: string;
  modules: ReadonlyArray<(typeof COLLECTION_MODULES)[number]>;
  ctx: DataCollectionRowContext;
}) {
  const enabledCount = modules.filter((m) => ctx.moduleSettings?.[m.value] ?? false).length;
  const { t } = useTranslator();
  return (
    <details className="rounded-md border border-border/60 bg-muted/20" open={enabledCount > 0}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t('study_form.group_summary', {
          count: String(enabledCount),
          group: translateCatalog(t, 'group', group, group),
        })}
      </summary>
      <div className="space-y-3 px-4 pb-4">{modules.map((module) => renderModuleRow(module, ctx))}</div>
    </details>
  );
}

function DataCollectionModulesSection(ctx: DataCollectionRowContext) {
  const { t } = useTranslator();
  return (
    <fieldset className="space-y-4 rounded-lg border border-border p-5">
      <legend className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t('study_form.modules_legend')}
      </legend>
      {/* The per-mode meanings are on each control's own tooltip; repeating them as a
          four-line preamble put the first module below the fold. */}
      <FieldHint>{t('study_form.modules_hint')}</FieldHint>
      <div className="space-y-3">
        {COLLECTION_MODULE_GROUP_ORDER.map((group) => (
          <DataCollectionModuleGroup
            ctx={ctx}
            group={group}
            key={group}
            modules={COLLECTION_MODULES.filter((m) => m.group === group)}
          />
        ))}
      </div>
    </fieldset>
  );
}

export function StudyFormDialog({ mode, onSubmit, study }: StudyFormDialogProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslator();
  const failedKey = submitFailureKey(mode);
  // Edit-mode reads only fire once the dialog is open and we have a study id.
  const skipStudyReads = shouldSkipStudyReads(mode, study?.id, open);
  const {
    data: limits,
    isError: isLimitsError,
    isFetching: isLimitsFetching,
  } = useGetStudyLimitsQuery(study?.id ?? '', { skip: skipStudyReads });
  const {
    data: dataCollection,
    isError: isDataCollectionError,
    isFetching: isDataCollectionFetching,
  } = useGetStudyDataCollectionSettingQuery(study?.id ?? '', { skip: skipStudyReads });
  const {
    data: studySettings,
    isError: isStudySettingsError,
    isFetching: isStudySettingsFetching,
  } = useGetStudySettingsQuery(study?.id ?? '', { skip: skipStudyReads });
  const [form, setForm] = useState<StudyFormData>(() => getInitialFormData(study));
  const [formInitialized, setFormInitialized] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedForOpen = useRef(false);
  const submissionInFlight = useRef(false);
  const studyReadState = resolveStudyReadState(
    mode,
    [isLimitsFetching, isDataCollectionFetching, isStudySettingsFetching],
    [isLimitsError, isDataCollectionError, isStudySettingsError],
  );

  useEffect(() => {
    if (!open || studyReadState !== 'ready' || initializedForOpen.current) return;
    setForm(getInitialFormData(study, limits, dataCollection, studySettings?.ParticipantPolicy));
    setError(null);
    initializedForOpen.current = true;
    setFormInitialized(true);
  }, [open, studyReadState, study, limits, dataCollection, studySettings?.ParticipantPolicy]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      initializedForOpen.current = false;
      setFormInitialized(false);
    }
    setOpen(nextOpen);
  };

  const update = <K extends keyof StudyFormData>(key: K, value: StudyFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleFeature = (feature: string) => {
    setForm((prev) => ({ ...prev, features: toggleInArray(prev.features, feature) }));
  };

  const setModuleDisposition = (moduleId: string, disposition: CollectionDataDisposition) => {
    setForm((prev) => ({
      ...prev,
      moduleDispositions: { ...prev.moduleDispositions, [moduleId]: disposition },
    }));
  };

  // A module is one of three states, not two independent toggles: participants must accept
  // it (required), may decline it (optional), or it is not collected at all (disabled).
  // Enabled/required move together in a single update so the pair can never be inconsistent.
  const setModuleMode = (moduleId: string, mode: ModuleMode) => {
    setForm((prev) => ({
      ...prev,
      moduleRequired: { ...prev.moduleRequired, [moduleId]: mode === 'required' },
      moduleSettings: { ...prev.moduleSettings, [moduleId]: mode !== 'disabled' },
    }));
  };

  const toggleHealthConnectRecordType = (recordType: string) => {
    setForm((previous) => {
      const current = previous.healthConnectRecordTypes ?? [];
      return { ...previous, healthConnectRecordTypes: toggleHealthConnectScope(current, recordType) };
    });
  };

  const setParticipantPolicyField = (field: keyof ParticipantPolicyForm, value: string) => {
    setForm((previous) => ({
      ...previous,
      participantPolicy: { ...(previous.participantPolicy ?? EMPTY_PARTICIPANT_POLICY_FORM), [field]: value },
    }));
  };

  // Edit a per-sensor module's own sampling rate or duty cycle (per-sensor consent redesign).
  const setSensorConfig = (moduleId: string, field: 'active' | 'period' | 'rate', value: string) => {
    const key = SENSOR_FIELD_TO_FORM_KEY[field];
    setForm((prev) => ({ ...prev, [key]: { ...prev[key], [moduleId]: value } }));
  };

  // Edit a pull/periodic module's own collection interval (seconds).
  const setModuleInterval = (moduleId: string, value: string) => {
    setForm((prev) => ({ ...prev, moduleIntervalSeconds: { ...prev.moduleIntervalSeconds, [moduleId]: value } }));
  };

  // Edit interaction_events' grid granularity or clicks/scrolls capture toggles.
  const setInteractionConfig = makeInteractionConfigHandler(setForm);

  const hasDataCollection = form.features.includes('CHRONICLE_DATA_COLLECTION');
  const canSubmit = formInitialized && studyReadState === 'ready' && isFormComplete(form) && !isSubmitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // React state does not update until the current event turn yields. A same-turn
    // double click can therefore enter this handler twice while `isSubmitting` is
    // still false. Acquire the ref-backed fence synchronously before awaiting.
    if (!formInitialized || studyReadState !== 'ready' || !isFormComplete(form) || submissionInFlight.current) return;
    submissionInFlight.current = true;

    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(form);
      setOpen(false);
    } catch (err) {
      setError(getErrorMessage(err, t(failedKey)));
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <StudyDialogTrigger mode={mode} />
      <DialogContent className="max-h-[90vh] w-[min(95vw,72rem)] overflow-y-auto pb-0">
        <DialogTitle>{mode === 'create' ? t('study_form.create') : t('study_form.edit_title')}</DialogTitle>
        <DialogDescription>
          {mode === 'create' ? t('study_form.create_description') : t('study_form.edit_description')}
        </DialogDescription>

        {studyReadState === 'pending' ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            {t('study_form.loading_settings')}
          </div>
        ) : studyReadState === 'failed' ? (
          <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {t('study_form.settings_failed')}
          </div>
        ) : (
          <form
            className="mt-4 space-y-8"
            onSubmit={(event) => {
              handleSubmit(event).catch((err) => {
                submissionInFlight.current = false;
                setIsSubmitting(false);
                setError(getErrorMessage(err, t(failedKey)));
              });
            }}
          >
            {/* Section 1: Basic Study Information */}
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t('study_form.info_legend')}
              </legend>

              <div className="space-y-1.5">
                <Label htmlFor="study-title" required>
                  {t('study_form.name')}
                </Label>
                <Input
                  id="study-title"
                  onChange={(e) => update('title', e.target.value)}
                  placeholder={t('study_form.name_placeholder')}
                  required
                  value={form.title}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="study-description">{t('study_form.description')}</Label>
                <Textarea
                  id="study-description"
                  onChange={(e) => update('description', e.target.value)}
                  placeholder={t('study_form.description_placeholder')}
                  value={form.description}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="study-group">{t('study_form.group')}</Label>
                  <Input
                    id="study-group"
                    onChange={(e) => update('group', e.target.value)}
                    placeholder={t('study_form.group_placeholder')}
                    value={form.group}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="study-version">{t('study_form.version')}</Label>
                  <Input
                    id="study-version"
                    onChange={(e) => update('version', e.target.value)}
                    placeholder="1.0"
                    value={form.version}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="study-contact" required>
                  {t('study_form.contact_email')}
                </Label>
                <Input
                  aria-invalid={form.contact.length > 0 && !isValidEmail(form.contact)}
                  id="study-contact"
                  onChange={(e) => update('contact', e.target.value)}
                  placeholder="researcher@university.edu"
                  required
                  type="email"
                  value={form.contact}
                />
              </div>

              <div className="space-y-2">
                <Label required>{t('study_form.features')}</Label>
                <div className="flex flex-wrap gap-2">
                  {STUDY_FEATURES.map(({ label, value }) => (
                    <Button
                      aria-pressed={form.features.includes(value)}
                      key={value}
                      onClick={() => toggleFeature(value)}
                      size="sm"
                      type="button"
                      variant={form.features.includes(value) ? 'default' : 'outline'}
                    >
                      {translateCatalog(t, 'feature', value, label)}
                    </Button>
                  ))}
                </div>
                <FieldHint>{t('study_form.features_hint')}</FieldHint>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
                <input
                  checked={form.notificationsEnabled}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  id="study-notifications"
                  onChange={() => update('notificationsEnabled', !form.notificationsEnabled)}
                  type="checkbox"
                />
                <label className="cursor-pointer" htmlFor="study-notifications">
                  {t('study_form.daily_notifications')}
                </label>
              </div>
            </fieldset>

            <StudyParticipantPolicyFields
              onChange={setParticipantPolicyField}
              value={form.participantPolicy ?? EMPTY_PARTICIPANT_POLICY_FORM}
            />

            {/* Section 2b: Data Collection Modules */}
            {hasDataCollection && (
              <DataCollectionModulesSection
                healthConnectRecordTypes={form.healthConnectRecordTypes ?? []}
                interactionConfig={toInteractionConfig(form)}
                mode={mode}
                moduleDispositions={form.moduleDispositions}
                moduleIntervalSeconds={form.moduleIntervalSeconds}
                moduleRequired={form.moduleRequired}
                moduleSettings={form.moduleSettings}
                onDispositionChange={setModuleDisposition}
                onHealthConnectRecordTypeToggle={toggleHealthConnectRecordType}
                onInteractionConfigChange={setInteractionConfig}
                onModuleIntervalChange={setModuleInterval}
                onSensorConfigChange={setSensorConfig}
                onSetMode={setModuleMode}
                sensorDutyActive={form.sensorDutyActive}
                sensorDutyPeriod={form.sensorDutyPeriod}
                sensorRateHz={form.sensorRateHz}
              />
            )}

            {/* Section 3: Study Limits */}
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t('study_form.limits_legend')}
              </legend>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="participant-limit">{t('study_form.participant_limit')}</Label>
                  <Input
                    id="participant-limit"
                    min={1}
                    onChange={(e) => update('participantLimit', e.target.value)}
                    placeholder="100"
                    type="number"
                    value={form.participantLimit}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="study-duration">{t('study_form.duration_days')}</Label>
                  <Input
                    id="study-duration"
                    min={1}
                    onChange={(e) => update('studyDurationDays', e.target.value)}
                    placeholder="365"
                    type="number"
                    value={form.studyDurationDays}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="data-retention">{t('study_form.retention_days')}</Label>
                  <Input
                    id="data-retention"
                    min={1}
                    onChange={(e) => update('dataRetentionDays', e.target.value)}
                    placeholder="730"
                    type="number"
                    value={form.dataRetentionDays}
                  />
                </div>
              </div>
            </fieldset>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* Sticky: with 31 module rows the form scrolls past 5000px, so Save sat below
              everything — retitling a study meant scrolling the whole module list to
              reach the button. -mx/px cancel the dialog padding so the bar spans it. */}
            <div className="sticky bottom-0 z-10 -mx-6 flex justify-end gap-3 border-t border-border bg-card px-6 pb-6 pt-4">
              <Button onClick={() => setOpen(false)} type="button" variant="ghost">
                {t('common.cancel')}
              </Button>
              <Button disabled={!canSubmit} type="submit">
                {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                {t(submitButtonKey(mode, isSubmitting))}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
