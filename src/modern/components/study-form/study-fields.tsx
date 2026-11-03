import { Download, Upload } from 'lucide-react';
import { type ChangeEvent, type Dispatch, type SetStateAction, useId, useRef, useState } from 'react';
import { StudyParticipantPolicyFields } from '@/components/study-participant-policy-fields';
import { Button } from '@/components/ui/button';
import { FieldHint } from '@/components/ui/field-hint';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { APP_USAGE_FREQUENCIES, type AppUsageFrequency, WITHDRAWAL_MODE } from '@/generated/chronicle-contracts';
import { translateCatalog, useTranslator } from '@/i18n';
import { triggerBlobDownload } from '@/lib/download';
import { getErrorMessage } from '@/lib/errors';
import { EMPTY_PARTICIPANT_POLICY_FORM } from '@/lib/participant-policy';
import {
  applyStudyConfig,
  ignoredStudyConfigEntries,
  keepsCurrentParticipantPolicy,
  parseStudyConfig,
  STUDY_CONFIG_MAX_BYTES,
  serializeStudyConfig,
  studyConfigFileName,
  studyFieldLocked,
} from '@/lib/study-config-file';
import {
  DEFAULT_STUDY_TIME_ZONE,
  DEFAULT_WITHDRAWAL_MODE,
  STUDY_FEATURES,
  type WithdrawalMode,
} from '@/lib/study-constants';
import { type StudyFormData, studyFieldName } from '@/lib/study-form-model';
import { StudyCollectionFields } from './collection-fields';
import type { StudyFieldChange, StudyFormMode } from './types';
import { useStudyFormFields } from './use-study-form-data';

// Export/import of the whole form as one portable JSON file (lib/study-config-file). Export
// serializes the current form state, so unsaved edits are included. Import replaces the form
// state and nothing more: the normal Save path persists it.
type StudyConfigTransferProps = {
  form: StudyFormData;
  onImport: (next: StudyFormData) => void;
};

function useStudyConfigTransfer({ form, onImport }: StudyConfigTransferProps) {
  const { t } = useTranslator();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedFrom, setImportedFrom] = useState<string | null>(null);
  const [policyKept, setPolicyKept] = useState(false);
  const [ignored, setIgnored] = useState<string[]>([]);

  const exportConfig = () => {
    const now = new Date();
    const blob = new Blob([serializeStudyConfig(form, now)], { type: 'application/json' });
    triggerBlobDownload(blob, studyConfigFileName(form.title, now));
  };

  const importConfig = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again re-fires onChange.
    event.target.value = '';
    if (!file) return;
    setImportError(null);
    setImportedFrom(null);
    // Check the size before reading: file.text() would otherwise pull a multi-gigabyte file
    // into memory (and its UTF-16 copy) before the cap inside parseStudyConfig could fire,
    // stalling the tab and losing whatever is unsaved in the open dialog.
    if (file.size > STUDY_CONFIG_MAX_BYTES) {
      setImportError(t('study_config.too_large'));
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      // A read failure carries an English-only engine message (DOMException); show the
      // translated sentence instead.
      setImportError(t('study_form.import_config_failed'));
      return;
    }
    try {
      onImport(applyStudyConfig(form, parseStudyConfig(text)));
      setPolicyKept(keepsCurrentParticipantPolicy(form));
      setIgnored(ignoredStudyConfigEntries(text));
      setImportedFrom(file.name);
    } catch (err) {
      setImportError(getErrorMessage(err, t('study_form.import_config_failed')));
    }
  };

  return { exportConfig, importConfig, fileInput, importedFrom, policyKept, ignored, importError, setImportError };
}

function StudyConfigTransfer(props: StudyConfigTransferProps) {
  const { t } = useTranslator();
  const { exportConfig, importConfig, fileInput, importedFrom, policyKept, ignored, importError } =
    useStudyConfigTransfer(props);
  return (
    <div className="space-y-2 border-b border-border/60 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <FieldHint className="max-w-prose">{t('study_form.transfer_hint')}</FieldHint>
        <div className="flex gap-2 max-sm:w-full max-sm:flex-col max-sm:[&>button]:w-full">
          <Button onClick={exportConfig} size="sm" type="button" variant="outline">
            <Download className="mr-2 h-4 w-4" />
            {t('study_form.export_config')}
          </Button>
          <Button onClick={() => fileInput.current?.click()} size="sm" type="button" variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            {t('study_form.import_config')}
          </Button>
          {/* The visible button is the one control: a rendered input would be an unlabeled
              tab stop and a duplicate for a screen reader. `hidden` removes it from both, and
              .click() still opens the picker. */}
          <input
            accept="application/json,.json"
            data-testid="study-config-file"
            hidden
            onChange={(event) => {
              void importConfig(event);
            }}
            ref={fileInput}
            type="file"
          />
        </div>
      </div>
      {/* Mounted unconditionally: a polite live region inserted with its text already in it is
          routinely not announced, so the import would silently replace every field. */}
      <p className="text-xs text-foreground" role="status">
        {importedFrom ? t('study_form.import_config_done', { file: importedFrom }) : ''}
        {importedFrom && policyKept ? ` ${t('study_form.import_config_policy_kept')}` : ''}
        {importedFrom && ignored.length > 0
          ? ` ${t('study_form.import_config_ignored', { entries: ignored.join(', ') })}`
          : ''}
      </p>
      {importError && (
        <p className="text-xs text-destructive" role="alert">
          {importError}
        </p>
      )}
    </div>
  );
}

function AppUsageFrequencyField({ form, update }: { form: StudyFormData; update: StudyFieldChange }) {
  const { t } = useTranslator();
  return (
    <div className="space-y-1.5">
      <Label htmlFor="app-usage-frequency">{t('study_form.app_usage_frequency')}</Label>
      <select
        id="app-usage-frequency"
        name="app-usage-frequency"
        className="w-full rounded-md border border-input bg-background px-3 py-2"
        value={form.appUsageFrequency ?? 'DAILY'}
        onChange={(event) => update('appUsageFrequency', event.target.value as AppUsageFrequency)}
      >
        {APP_USAGE_FREQUENCIES.map((frequency) => (
          <option key={frequency} value={frequency}>
            {t(`study_form.app_usage_frequency_${frequency}`)}
          </option>
        ))}
      </select>
    </div>
  );
}

type LimitField = 'dataRetentionDays' | 'studyDurationDays' | 'withdrawalMode' | 'timeZone';

function StudyLimitsFieldset({
  studyDurationDays,
  dataRetentionDays,
  withdrawalMode,
  withdrawalLocked,
  timeZone,
  onChange,
}: {
  studyDurationDays: string;
  dataRetentionDays: string;
  withdrawalMode: WithdrawalMode | undefined;
  withdrawalLocked: boolean;
  timeZone: string | undefined;
  onChange: <K extends LimitField>(field: K, value: StudyFormData[K]) => void;
}) {
  const { t } = useTranslator();
  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t('study_form.limits_legend')}
      </legend>

      <StudyLimitNumbers
        studyDurationDays={studyDurationDays}
        dataRetentionDays={dataRetentionDays}
        onChange={onChange}
      />
      <div className="space-y-1.5">
        <Label htmlFor="withdrawal-mode">{t('study_form.withdrawal_mode')}</Label>
        <select
          id="withdrawal-mode"
          name="withdrawal-mode"
          disabled={withdrawalLocked}
          className="w-full rounded-md border border-input bg-background px-3 py-2"
          value={withdrawalMode ?? DEFAULT_WITHDRAWAL_MODE}
          onChange={(event) => onChange('withdrawalMode', event.target.value as WithdrawalMode)}
        >
          <option value={WITHDRAWAL_MODE.KEEP_PRIOR_DATA}>{t('study_form.withdrawal_keep')}</option>
          <option value={WITHDRAWAL_MODE.ERASE}>{t('study_form.withdrawal_request_erasure')}</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="study-time-zone">{t('study_form.time_zone')}</Label>
        <Input
          id="study-time-zone"
          spellCheck={false}
          name="study-time-zone"
          value={timeZone ?? DEFAULT_STUDY_TIME_ZONE}
          onChange={(event) => onChange('timeZone', event.target.value)}
        />
      </div>
    </fieldset>
  );
}

function StudyLimitNumbers({
  studyDurationDays,
  dataRetentionDays,
  onChange,
}: {
  studyDurationDays: string;
  dataRetentionDays: string;
  onChange: <K extends 'studyDurationDays' | 'dataRetentionDays'>(field: K, value: StudyFormData[K]) => void;
}) {
  const { t } = useTranslator();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="study-duration">{t('study_form.duration_days')}</Label>
        <Input
          id="study-duration"
          name="study-duration"
          min={1}
          onChange={(e) => onChange('studyDurationDays', e.target.value)}
          placeholder="365…"
          type="number"
          value={studyDurationDays}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="data-retention">{t('study_form.retention_days')}</Label>
        <Input
          id="data-retention"
          name="data-retention"
          min={1}
          onChange={(e) => onChange('dataRetentionDays', e.target.value)}
          placeholder="730…"
          type="number"
          value={dataRetentionDays}
        />
      </div>
    </div>
  );
}
function StudyTitleFields({
  title,
  description,
  update,
  showValidationErrors,
}: {
  title: string;
  description: string;
  update: StudyFieldChange;
  showValidationErrors: boolean;
}) {
  const { t } = useTranslator();
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="study-title" required>
          {t('study_form.name')}
        </Label>
        <Input
          aria-describedby={showValidationErrors && !title.trim() ? 'study-title-error' : undefined}
          aria-invalid={showValidationErrors && !title.trim()}
          id="study-title"
          name="study-title"
          onChange={(e) => update('title', e.target.value)}
          placeholder={t('study_form.name_placeholder')}
          required
          value={title}
        />
        {showValidationErrors && !title.trim() && (
          <p className="text-xs text-destructive" id="study-title-error">
            {t('study_form.title_required')}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="study-description">{t('study_form.description')}</Label>
        <Textarea
          id="study-description"
          name="study-description"
          onChange={(e) => update('description', e.target.value)}
          placeholder={t('study_form.description_placeholder')}
          value={description}
        />
      </div>
    </>
  );
}

function StudyContactFields({
  group,
  version,
  contact,
  update,
  showValidationErrors,
  contactError,
}: {
  group: string;
  version: string;
  contact: string;
  update: StudyFieldChange;
  showValidationErrors: boolean;
  contactError: string | null;
}) {
  const { t } = useTranslator();
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="study-group">{t('study_form.group')}</Label>
          <Input
            id="study-group"
            name="study-group"
            onChange={(e) => update('group', e.target.value)}
            placeholder={t('study_form.group_placeholder')}
            value={group}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="study-version">{t('study_form.version')}</Label>
          <Input
            id="study-version"
            spellCheck={false}
            name="study-version"
            onChange={(e) => update('version', e.target.value)}
            placeholder="1.0…"
            value={version}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="study-contact" required>
          {t('study_form.contact_email')}
        </Label>
        <Input
          aria-describedby={showValidationErrors && contactError ? 'study-contact-error' : undefined}
          aria-invalid={showValidationErrors && Boolean(contactError)}
          autoComplete="email"
          name="contact-email"
          spellCheck={false}
          id="study-contact"
          onChange={(e) => update('contact', e.target.value)}
          placeholder="researcher@university.edu…"
          required
          type="email"
          value={contact}
        />
        {showValidationErrors && contactError && (
          <p className="text-xs text-destructive" id="study-contact-error">
            {contactError}
          </p>
        )}
      </div>
    </>
  );
}

function StudyFeatureFields({
  features,
  toggleFeature,
  showValidationErrors,
}: {
  features: string[];
  toggleFeature: (feature: string) => void;
  showValidationErrors: boolean;
}) {
  const { t } = useTranslator();
  const idPrefix = useId();
  return (
    <div className="space-y-2">
      <Label required>{t('study_form.features')}</Label>
      <div className="flex flex-wrap gap-2">
        {STUDY_FEATURES.map(({ label, value }) => (
          <Button
            aria-pressed={features.includes(value)}
            id={`${idPrefix}-feature-${value}`}
            name={studyFieldName.feature(value)}
            key={value}
            onClick={() => toggleFeature(value)}
            size="sm"
            type="button"
            variant={features.includes(value) ? 'selected' : 'outline'}
          >
            {translateCatalog(t, 'feature', value, label)}
          </Button>
        ))}
      </div>
      <FieldHint>{t('study_form.features_hint')}</FieldHint>
      {showValidationErrors && features.length === 0 && (
        <p className="text-xs text-destructive" id="study-features-error">
          {t('study_form.feature_required')}
        </p>
      )}
    </div>
  );
}

type StudyFormEditorProps = {
  form: StudyFormData;
  setForm: Dispatch<SetStateAction<StudyFormData>>;
  mode: StudyFormMode;
  showValidationErrors: boolean;
  contactError: string | null;
};

export function StudyFormEditor({ form, setForm, mode, showValidationErrors, contactError }: StudyFormEditorProps) {
  const { t } = useTranslator();
  const fields = useStudyFormFields(setForm);
  return (
    <>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t('study_form.info_legend')}
        </legend>
        <StudyTitleFields
          title={form.title}
          description={form.description}
          update={fields.update}
          showValidationErrors={showValidationErrors}
        />
        <StudyContactFields
          group={form.group}
          version={form.version}
          contact={form.contact}
          update={fields.update}
          showValidationErrors={showValidationErrors}
          contactError={contactError}
        />
        <StudyFeatureFields
          features={form.features}
          toggleFeature={fields.toggleFeature}
          showValidationErrors={showValidationErrors}
        />
      </fieldset>
      <fieldset disabled={studyFieldLocked(form, 'participantPolicy')}>
        <StudyParticipantPolicyFields
          mode={mode}
          onChange={fields.setParticipantPolicyField}
          showErrors={showValidationErrors}
          value={form.participantPolicy ?? EMPTY_PARTICIPANT_POLICY_FORM}
        />
      </fieldset>
      {form.features.includes('CHRONICLE_DATA_COLLECTION') && (
        <StudyCollectionFields modules={form.modules} onChange={fields.setModule} />
      )}
      <StudyLimitsFieldset
        studyDurationDays={form.studyDurationDays}
        dataRetentionDays={form.dataRetentionDays}
        withdrawalMode={form.withdrawalMode}
        withdrawalLocked={studyFieldLocked(form, 'withdrawalMode')}
        timeZone={form.timeZone}
        onChange={fields.update}
      />
      <AppUsageFrequencyField form={form} update={fields.update} />
      <StudyConfigTransfer form={form} onImport={(next) => setForm(next)} />
    </>
  );
}
