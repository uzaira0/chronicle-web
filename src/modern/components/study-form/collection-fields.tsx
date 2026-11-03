import { type ReactNode, useId } from 'react';
import { FieldHint } from '@/components/ui/field-hint';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { translateCatalog, useTranslator } from '@/i18n';
import { COLLECTION_NUMBER_BOUNDS } from '@/lib/collection-numbers';
import {
  COLLECTION_MODULE_GROUP_ORDER,
  COLLECTION_MODULES,
  type CollectionModuleId,
  HEALTH_CONNECT_RECORD_TYPES,
  INTERVAL_CONFIGURABLE_MODULES,
  isKnownHealthConnectRecordType,
  isPlayStoreBuildModule,
} from '@/lib/study-constants';
import { healthConnectScopeMissing, toggleHealthConnectRecordType } from '@/lib/study-form-helpers';
import type { InteractionConfig, ModuleDraft, ModuleMode, StudyFormData } from '@/lib/study-form-model';
import { studyFieldName } from '@/lib/study-form-model';
import { cn } from '@/lib/utils';
import type { ModuleDraftChange } from './types';

const MODULE_MODES: ReadonlyArray<{ hintKey: string; labelKey: string; selectedClass: string; value: ModuleMode }> = [
  {
    value: 'required',
    labelKey: 'study_form.mode_required',
    hintKey: 'study_form.mode_required_hint',
    selectedClass: 'bg-primary/10 text-foreground',
  },
  {
    value: 'optional',
    labelKey: 'study_form.mode_optional',
    hintKey: 'study_form.mode_optional_hint',
    selectedClass: 'bg-info-bg text-info',
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
  moduleId,
  consentGated,
  label,
  mode,
  onChange,
}: {
  moduleId: CollectionModuleId;
  consentGated: boolean;
  label: string;
  mode: ModuleMode;
  onChange: (mode: ModuleMode) => void;
}) {
  // Real radio inputs (visually hidden, styled labels) rather than buttons: the group gets
  // native arrow-key navigation and screen-reader semantics.
  const groupName = `module-mode-${moduleId}`;
  const { t } = useTranslator();
  return (
    <fieldset className="flex shrink-0 overflow-hidden rounded-md border border-border">
      <legend className="sr-only">{t('study_form.mode_legend', { label })}</legend>
      {MODULE_MODES.filter(({ value }) => value !== 'required' || consentGated).map(
        ({ hintKey, labelKey, selectedClass, value }) => {
          const selected = mode === value;
          const enablement = !consentGated && value === 'optional';
          return (
            <label
              className={cn(
                'cursor-pointer px-3.5 py-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring',
                selected ? `font-medium ${selectedClass}` : 'bg-transparent text-muted-foreground hover:bg-muted',
              )}
              key={value}
              title={t(enablement ? 'study_form.mode_enabled_hint' : hintKey)}
            >
              <input
                checked={selected}
                className="sr-only"
                name={groupName}
                onChange={() => onChange(value)}
                type="radio"
                value={value}
              />
              {t(enablement ? 'common.enabled' : labelKey)}
            </label>
          );
        },
      )}
    </fieldset>
  );
}

function HealthConnectScopeControl({
  draft,
  onToggle,
}: {
  onToggle: (recordType: string) => void;
  draft: ModuleDraft;
}) {
  const selected = draft.healthConnectRecordTypes ?? [];
  const scopeMissing = healthConnectScopeMissing(draft);
  const selectedSet = new Set(selected);
  const unknownRecordTypes = selected.filter((recordType) => !isKnownHealthConnectRecordType(recordType));
  const { t } = useTranslator();
  const idPrefix = useId();
  return (
    <>
      <fieldset aria-invalid={scopeMissing} className="space-y-3 border-t border-border/40 pt-3">
        <legend className="text-sm font-medium">{t('study_form.hc_legend')}</legend>
        <p className="text-xs text-muted-foreground">{t('study_form.hc_description')}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {HEALTH_CONNECT_RECORD_TYPES.map(({ label, value }) => (
            <label
              className="flex items-center gap-2 text-sm"
              htmlFor={`${idPrefix}-health-connect-${value}`}
              key={value}
            >
              <input
                checked={selectedSet.has(value)}
                className="h-4 w-4 rounded border-border text-primary"
                id={`${idPrefix}-health-connect-${value}`}
                name={studyFieldName.healthConnect(value)}
                onChange={() => onToggle(value)}
                type="checkbox"
              />
              {translateCatalog(t, 'health_connect', value, label)}
            </label>
          ))}
        </div>
        {unknownRecordTypes.length > 0 && (
          <div className="rounded-md border border-warning/50 bg-warning-bg px-3 py-2 text-xs text-warning">
            {t('study_form.hc_unknown_types', { types: unknownRecordTypes.join(', ') })}
          </div>
        )}
        {scopeMissing && (
          <div className="space-y-1 text-xs text-destructive">
            <p>{t('study_form.hc_select_one')}</p>
            <p>{t('study_form.hc_none_selected')}</p>
          </div>
        )}
      </fieldset>
      <div className="rounded-md border border-warning/50 bg-warning-bg px-3 py-2.5 text-xs text-warning">
        {t('study_form.hc_warning')}
      </div>
    </>
  );
}

function DataCollectionModuleHeader(props: {
  module: Pick<
    (typeof COLLECTION_MODULES)[number],
    'value' | 'label' | 'description' | 'privacyClass' | 'alwaysOn' | 'consentGated'
  >;
  mode: ModuleMode;
  onChange: (mode: ModuleMode) => void;
}) {
  const { t } = useTranslator();
  const { module, mode, onChange } = props;
  const { value } = module;
  const label = translateCatalog(t, 'module', value, module.label);
  const description = translateCatalog(t, 'module_description', value, module.description);
  const privacyClass = translateCatalog(t, 'privacy_class', module.privacyClass, module.privacyClass);
  return (
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
        {!isPlayStoreBuildModule(value) && (
          <p className="text-xs text-warning">{t('modules_panel.play_store_notice')}</p>
        )}
      </div>
      {module.alwaysOn ? (
        <span
          className="shrink-0 rounded-md border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground"
          title={t('study_form.always_on_hint')}
        >
          {t('study_form.always_on')}
        </span>
      ) : (
        <ModuleModeControl
          moduleId={value}
          consentGated={module.consentGated}
          label={label}
          mode={mode}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function ModuleSensorControls(props: {
  moduleId: CollectionModuleId;
  sensorConfig: NonNullable<ModuleDraft['sensorPolicy']>;
  onChange: (policy: NonNullable<ModuleDraft['sensorPolicy']>) => void;
}) {
  const { t } = useTranslator();
  const idPrefix = useId();
  const { moduleId: value, sensorConfig, onChange } = props;
  return (
    <div className="grid gap-4 border-t border-border/40 pt-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label variant="muted" htmlFor={`${idPrefix}-rate-${value}`}>
          {t('study_form.sampling_rate')}
        </Label>
        <Input
          id={`${idPrefix}-rate-${value}`}
          name={studyFieldName.collectionNumber(value, 'rateHz')}
          min={COLLECTION_NUMBER_BOUNDS.rateHz.min}
          max={COLLECTION_NUMBER_BOUNDS.rateHz.max}
          onChange={(e) => onChange({ ...sensorConfig, rateHz: e.target.value })}
          type="number"
          value={sensorConfig.rateHz}
        />
      </div>
      <div className="space-y-1.5">
        <Label variant="muted" htmlFor={`${idPrefix}-active-${value}`}>
          {t('study_form.duty_active')}
        </Label>
        <Input
          id={`${idPrefix}-active-${value}`}
          name={studyFieldName.collectionNumber(value, 'dutyActive')}
          min={COLLECTION_NUMBER_BOUNDS.dutyActive.min}
          onChange={(e) => onChange({ ...sensorConfig, dutyActive: e.target.value })}
          type="number"
          value={sensorConfig.dutyActive}
        />
      </div>
      <div className="space-y-1.5">
        <Label variant="muted" htmlFor={`${idPrefix}-period-${value}`}>
          {t('study_form.duty_period')}
        </Label>
        <Input
          id={`${idPrefix}-period-${value}`}
          name={studyFieldName.collectionNumber(value, 'dutyPeriod')}
          min={COLLECTION_NUMBER_BOUNDS.dutyPeriod.min}
          onChange={(e) => onChange({ ...sensorConfig, dutyPeriod: e.target.value })}
          type="number"
          value={sensorConfig.dutyPeriod}
        />
      </div>
    </div>
  );
}

function ModuleIntervalControls(props: {
  moduleId: CollectionModuleId;
  intervalSeconds: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslator();
  const idPrefix = useId();
  const { moduleId: value, intervalSeconds, onChange } = props;
  return (
    <div className="border-t border-border/40 pt-3">
      <div className="space-y-1.5">
        <Label variant="muted" htmlFor={`${idPrefix}-interval-${value}`}>
          {t('study_form.collection_interval')}
        </Label>
        <Input
          id={`${idPrefix}-interval-${value}`}
          name={studyFieldName.collectionNumber(value, 'intervalSeconds')}
          min={COLLECTION_NUMBER_BOUNDS.intervalSeconds.min}
          onChange={(e) => onChange(e.target.value)}
          type="number"
          value={intervalSeconds}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{t('study_form.interval_hint')}</p>
    </div>
  );
}

function ModuleInteractionControls({
  interactionConfig,
  onChange,
}: {
  interactionConfig: InteractionConfig;
  onChange: (interaction: InteractionConfig) => void;
}) {
  const { t } = useTranslator();
  const idPrefix = useId();
  return (
    <div className="space-y-3 border-t border-border/40 pt-3">
      <p className="text-xs font-medium text-muted-foreground">{t('study_form.legacy_grid')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['gridRows', 'gridCols'] as const).map((field) => {
          const rows = field === 'gridRows';
          const fieldName = studyFieldName.collectionNumber('interaction_events', field);
          const id = `${idPrefix}-${fieldName}`;
          return (
            <div className="space-y-1.5" key={field}>
              <Label variant="muted" htmlFor={id}>
                {t(rows ? 'study_form.grid_rows' : 'study_form.grid_cols')}
              </Label>
              <Input
                id={id}
                name={fieldName}
                min={COLLECTION_NUMBER_BOUNDS[field].min}
                max={COLLECTION_NUMBER_BOUNDS[field].max}
                type="number"
                value={interactionConfig[field]}
                onChange={(e) => onChange({ ...interactionConfig, [field]: e.target.value })}
              />
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-5">
        {INTERACTION_TOGGLES.map(({ field, id, labelKey }) => (
          <label className="flex items-center gap-2 text-sm text-muted-foreground" htmlFor={id} key={field}>
            <input
              checked={interactionConfig[field]}
              className="h-4 w-4"
              id={id}
              name={id}
              type="checkbox"
              onChange={(e) => onChange({ ...interactionConfig, [field]: e.target.checked })}
            />
            {t(labelKey)}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('study_form.interaction_note')}</p>
    </div>
  );
}

const INTERACTION_TOGGLES = [
  { field: 'captureClicks', id: 'clicks-interaction_events', labelKey: 'study_form.capture_clicks' },
  { field: 'captureScrolls', id: 'scrolls-interaction_events', labelKey: 'study_form.capture_scrolls' },
  { field: 'captureElementPosition', id: 'exact-position-interaction_events', labelKey: 'study_form.capture_bounds' },
] as const;

type ExtraControls = (draft: ModuleDraft, onChange: (draft: ModuleDraft) => void) => ReactNode;

// Form presentation beside the collection catalog: adding module-specific controls only
// changes this table. The row knows only a draft and how to replace it.
const MODULE_EXTRA_CONTROLS: Partial<Record<CollectionModuleId, ExtraControls>> = {
  health_connect: (draft, onChange) => (
    <HealthConnectScopeControl
      draft={draft}
      onToggle={(recordType) =>
        onChange({
          ...draft,
          healthConnectRecordTypes: toggleHealthConnectRecordType(draft.healthConnectRecordTypes ?? [], recordType),
        })
      }
    />
  ),
  interaction_events: (draft, onChange) =>
    draft.interaction && (
      <ModuleInteractionControls
        interactionConfig={draft.interaction}
        onChange={(interaction) => onChange({ ...draft, interaction })}
      />
    ),
};

type StudyCollectionFieldsProps = {
  modules: StudyFormData['modules'];
  onChange: ModuleDraftChange;
};

function ModuleRow({
  module,
  draft,
  onChange,
}: {
  module: (typeof COLLECTION_MODULES)[number];
  draft: ModuleDraft;
  onChange: (draft: ModuleDraft) => void;
}) {
  const { value, sensorType } = module;
  const enabled = draft.mode !== 'disabled';
  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 px-4 py-3">
      <DataCollectionModuleHeader module={module} mode={draft.mode} onChange={(mode) => onChange({ ...draft, mode })} />
      {enabled && draft.sensorPolicy && (
        <ModuleSensorControls
          moduleId={value}
          sensorConfig={draft.sensorPolicy}
          onChange={(sensorPolicy) => onChange({ ...draft, sensorPolicy })}
        />
      )}
      {enabled && !sensorType && INTERVAL_CONFIGURABLE_MODULES.has(value) && (
        <ModuleIntervalControls
          moduleId={value}
          intervalSeconds={draft.intervalSeconds}
          onChange={(intervalSeconds) => onChange({ ...draft, intervalSeconds })}
        />
      )}
      {enabled && MODULE_EXTRA_CONTROLS[value]?.(draft, onChange)}
    </div>
  );
}

function DataCollectionModuleGroup({
  group,
  enabledCount,
  children,
}: {
  group: string;
  enabledCount: number;
  children: ReactNode;
}) {
  const { t } = useTranslator();
  return (
    <details className="rounded-md border border-border/60 bg-muted/20" open={enabledCount > 0}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t('study_form.group_summary', {
          count: String(enabledCount),
          group: translateCatalog(t, 'group', group, group),
        })}
      </summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  );
}

export function StudyCollectionFields(props: StudyCollectionFieldsProps) {
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
            group={group}
            key={group}
            enabledCount={
              COLLECTION_MODULES.filter((m) => m.group === group && props.modules[m.value].mode !== 'disabled').length
            }
          >
            {COLLECTION_MODULES.filter((m) => m.group === group).map((module) => (
              <ModuleRow
                key={module.value}
                module={module}
                draft={props.modules[module.value]}
                onChange={(draft) => props.onChange(module.value, draft)}
              />
            ))}
          </DataCollectionModuleGroup>
        ))}
      </div>
    </fieldset>
  );
}
