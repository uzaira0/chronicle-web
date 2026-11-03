import { useId } from 'react';
import { FieldHint } from '@/components/ui/field-hint';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslator } from '@/i18n';
import {
  type ParticipantPolicyErrors,
  type ParticipantPolicyForm,
  validateParticipantPolicy,
} from '@/lib/participant-policy';
import { studyFieldName } from '@/lib/study-form-model';

type PolicyField = keyof ParticipantPolicyForm;

type StudyParticipantPolicyFieldsProps = {
  mode?: 'create' | 'edit';
  onChange: (field: PolicyField, value: string) => void;
  showErrors?: boolean;
  value: ParticipantPolicyForm;
};

// Each entry's label and placeholder live under `policy_fields.<key>` / `policy_fields.<key>_placeholder`.
const DISCLOSURE_FIELDS = [
  { field: 'purpose', key: 'purpose' },
  { field: 'expectedDuration', key: 'expected_duration' },
  { field: 'procedures', key: 'procedures' },
  { field: 'foreseeableRisks', key: 'foreseeable_risks' },
  { field: 'expectedBenefits', key: 'expected_benefits' },
  { field: 'dataUseAndSharing', key: 'data_use' },
  { field: 'retentionAndDeletion', key: 'retention' },
] as const satisfies ReadonlyArray<{ field: PolicyField; key: string }>;

function FieldError({
  id,
  errors,
  field,
  showErrors,
  value,
}: {
  id: string;
  errors: ParticipantPolicyErrors;
  field: PolicyField;
  showErrors: boolean;
  value: string;
}) {
  const error = value.trim() || showErrors ? errors[field] : undefined;
  return error ? (
    <p className="text-xs text-destructive" id={id}>
      {error}
    </p>
  ) : null;
}

export function StudyParticipantPolicyFields({
  mode = 'create',
  onChange,
  showErrors = false,
  value,
}: StudyParticipantPolicyFieldsProps) {
  const { t } = useTranslator();
  const idPrefix = useId();
  const alwaysRecordedHintId = `${idPrefix}-data-use-hint`;
  const errors = validateParticipantPolicy(value, t);
  const describedBy = (field: PolicyField) =>
    errors[field] && (value[field].trim() || showErrors) ? `${idPrefix}-${field}-error` : undefined;

  const renderInput = (field: PolicyField, label: string, placeholder: string, isUrl = false) => (
    <div className="space-y-1.5" key={field}>
      <Label htmlFor={`${idPrefix}-${field}`} required>
        {label}
      </Label>
      <Input
        aria-describedby={describedBy(field)}
        aria-invalid={Boolean(errors[field]) && (value[field].trim() !== '' || showErrors)}
        id={`${idPrefix}-${field}`}
        name={studyFieldName.policy(field)}
        maxLength={isUrl ? 2_048 : 8_000}
        onChange={(event) => onChange(field, event.target.value)}
        placeholder={placeholder}
        required
        type={isUrl ? 'url' : 'text'}
        value={value[field]}
      />
      <FieldError
        id={`${idPrefix}-${field}-error`}
        errors={errors}
        field={field}
        showErrors={showErrors}
        value={value[field]}
      />
    </div>
  );

  return (
    <details open={mode === 'create' || (showErrors && Object.keys(errors).length > 0)}>
      <summary className="cursor-pointer text-sm font-semibold">{t('policy_fields.legend')}</summary>
      <fieldset className="space-y-5 rounded-lg border border-border p-5">
        <legend className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t('policy_fields.legend')}
        </legend>
        <FieldHint>{t('policy_fields.hint')}</FieldHint>

        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              [
                'responsibleInstitution',
                t('policy_fields.responsible_institution'),
                t('policy_fields.responsible_institution_placeholder'),
              ],
              ['serverOperator', t('policy_fields.server_operator'), t('policy_fields.server_operator_placeholder')],
            ] as const
          ).map(([field, label, placeholder]) => renderInput(field, label, placeholder))}
        </div>

        {renderInput(
          'researchContact',
          t('policy_fields.research_contact'),
          t('policy_fields.research_contact_placeholder'),
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {DISCLOSURE_FIELDS.map(({ field, key }) => (
            <div className="space-y-1.5" key={field}>
              <Label htmlFor={`${idPrefix}-${field}`} required>
                {t(`policy_fields.${key}`)}
              </Label>
              <Textarea
                aria-describedby={
                  [field === 'dataUseAndSharing' && alwaysRecordedHintId, describedBy(field)]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                aria-invalid={Boolean(errors[field]) && (value[field].trim() !== '' || showErrors)}
                id={`${idPrefix}-${field}`}
                name={studyFieldName.policy(field)}
                maxLength={8_000}
                onChange={(event) => onChange(field, event.target.value)}
                placeholder={t(`policy_fields.${key}_placeholder`)}
                required
                value={value[field]}
              />
              {field === 'dataUseAndSharing' && (
                <p className="text-xs leading-5 text-muted-foreground" id={alwaysRecordedHintId}>
                  {t('policy_fields.data_use_always_recorded_hint')}
                </p>
              )}
              <FieldError
                id={`${idPrefix}-${field}-error`}
                errors={errors}
                field={field}
                showErrors={showErrors}
                value={value[field]}
              />
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ['privacyPolicyUrl', t('policy_fields.privacy_url'), 'https://research.example.org/privacy/study'],
              ['withdrawalUrl', t('policy_fields.withdrawal_url'), 'https://research.example.org/withdraw/study'],
            ] as const
          ).map(([field, label, placeholder]) => renderInput(field, label, placeholder, true))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-consentDocumentUrl`}>{t('policy_fields.consent_url')}</Label>
          <Input
            aria-describedby={describedBy('consentDocumentUrl')}
            aria-invalid={Boolean(errors.consentDocumentUrl) && (value.consentDocumentUrl.trim() !== '' || showErrors)}
            id={`${idPrefix}-consentDocumentUrl`}
            name={studyFieldName.policy('consentDocumentUrl')}
            maxLength={2_048}
            onChange={(event) => onChange('consentDocumentUrl', event.target.value)}
            placeholder="https://research.example.org/consent/study.pdf…"
            type="url"
            value={value.consentDocumentUrl}
          />
          <FieldHint>{t('policy_fields.consent_hint')}</FieldHint>
          <FieldError
            id={`${idPrefix}-consentDocumentUrl-error`}
            errors={errors}
            field="consentDocumentUrl"
            showErrors={showErrors}
            value={value.consentDocumentUrl}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-version`} required>
              {t('policy_fields.version')}
            </Label>
            <Input
              aria-describedby={describedBy('version')}
              aria-invalid={Boolean(errors.version) && (value.version.trim() !== '' || showErrors)}
              id={`${idPrefix}-version`}
              spellCheck={false}
              name={studyFieldName.policy('version')}
              maxLength={128}
              onChange={(event) => onChange('version', event.target.value)}
              placeholder="consent-2026-08-17…"
              required
              value={value.version}
            />
            <FieldError
              id={`${idPrefix}-version-error`}
              errors={errors}
              field="version"
              showErrors={showErrors}
              value={value.version}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-effectiveAt`} required>
              {t('policy_fields.effective_at')}
            </Label>
            <Input
              aria-describedby={describedBy('effectiveAt')}
              aria-invalid={Boolean(errors.effectiveAt) && (value.effectiveAt.trim() !== '' || showErrors)}
              id={`${idPrefix}-effectiveAt`}
              name={studyFieldName.policy('effectiveAt')}
              onChange={(event) => onChange('effectiveAt', event.target.value)}
              placeholder="2026-08-17T09:30:00-05:00…"
              required
              value={value.effectiveAt}
            />
            <FieldHint>{t('policy_fields.effective_hint')}</FieldHint>
            <FieldError
              id={`${idPrefix}-effectiveAt-error`}
              errors={errors}
              field="effectiveAt"
              showErrors={showErrors}
              value={value.effectiveAt}
            />
          </div>
        </div>
      </fieldset>
    </details>
  );
}
