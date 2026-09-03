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

type PolicyField = keyof ParticipantPolicyForm;

type StudyParticipantPolicyFieldsProps = {
  onChange: (field: PolicyField, value: string) => void;
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

function FieldError({ errors, field, value }: { errors: ParticipantPolicyErrors; field: PolicyField; value: string }) {
  const error = value.trim() ? errors[field] : undefined;
  return error ? (
    <p className="text-xs text-destructive" id={`participant-policy-${field}-error`}>
      {error}
    </p>
  ) : null;
}

export function StudyParticipantPolicyFields({ onChange, value }: StudyParticipantPolicyFieldsProps) {
  const { t } = useTranslator();
  const errors = validateParticipantPolicy(value, t);
  const describedBy = (field: PolicyField) =>
    errors[field] && value[field].trim() ? `participant-policy-${field}-error` : undefined;

  return (
    <fieldset className="space-y-5 rounded-lg border border-border p-5">
      <legend className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t('policy_fields.legend')}
      </legend>
      <FieldHint>{t('policy_fields.hint')}</FieldHint>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          [
            'responsibleInstitution',
            t('policy_fields.responsible_institution'),
            t('policy_fields.responsible_institution_placeholder'),
          ],
          ['serverOperator', t('policy_fields.server_operator'), t('policy_fields.server_operator_placeholder')],
        ].map(([field, label, placeholder]) => (
          <div className="space-y-1.5" key={field}>
            <Label htmlFor={`participant-policy-${field}`} required>
              {label}
            </Label>
            <Input
              aria-describedby={describedBy(field as PolicyField)}
              aria-invalid={Boolean(errors[field as PolicyField])}
              id={`participant-policy-${field}`}
              maxLength={8_000}
              onChange={(event) => onChange(field as PolicyField, event.target.value)}
              placeholder={placeholder}
              required
              value={value[field as PolicyField]}
            />
            <FieldError errors={errors} field={field as PolicyField} value={value[field as PolicyField]} />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="participant-policy-researchContact" required>
          {t('policy_fields.research_contact')}
        </Label>
        <Input
          aria-describedby={describedBy('researchContact')}
          aria-invalid={Boolean(errors.researchContact)}
          id="participant-policy-researchContact"
          maxLength={8_000}
          onChange={(event) => onChange('researchContact', event.target.value)}
          placeholder={t('policy_fields.research_contact_placeholder')}
          required
          value={value.researchContact}
        />
        <FieldError errors={errors} field="researchContact" value={value.researchContact} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {DISCLOSURE_FIELDS.map(({ field, key }) => (
          <div className="space-y-1.5" key={field}>
            <Label htmlFor={`participant-policy-${field}`} required>
              {t(`policy_fields.${key}`)}
            </Label>
            <Textarea
              aria-describedby={describedBy(field)}
              aria-invalid={Boolean(errors[field])}
              id={`participant-policy-${field}`}
              maxLength={8_000}
              onChange={(event) => onChange(field, event.target.value)}
              placeholder={t(`policy_fields.${key}_placeholder`)}
              required
              value={value[field]}
            />
            <FieldError errors={errors} field={field} value={value[field]} />
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ['privacyPolicyUrl', t('policy_fields.privacy_url'), 'https://research.example.org/privacy/study'],
          ['withdrawalUrl', t('policy_fields.withdrawal_url'), 'https://research.example.org/withdraw/study'],
        ].map(([field, label, placeholder]) => (
          <div className="space-y-1.5" key={field}>
            <Label htmlFor={`participant-policy-${field}`} required>
              {label}
            </Label>
            <Input
              aria-describedby={describedBy(field as PolicyField)}
              aria-invalid={Boolean(errors[field as PolicyField])}
              id={`participant-policy-${field}`}
              maxLength={2_048}
              onChange={(event) => onChange(field as PolicyField, event.target.value)}
              placeholder={placeholder}
              required
              type="url"
              value={value[field as PolicyField]}
            />
            <FieldError errors={errors} field={field as PolicyField} value={value[field as PolicyField]} />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="participant-policy-consentDocumentUrl">{t('policy_fields.consent_url')}</Label>
        <Input
          aria-describedby={describedBy('consentDocumentUrl')}
          aria-invalid={Boolean(errors.consentDocumentUrl)}
          id="participant-policy-consentDocumentUrl"
          maxLength={2_048}
          onChange={(event) => onChange('consentDocumentUrl', event.target.value)}
          placeholder="https://research.example.org/consent/study.pdf"
          type="url"
          value={value.consentDocumentUrl}
        />
        <FieldHint>{t('policy_fields.consent_hint')}</FieldHint>
        <FieldError errors={errors} field="consentDocumentUrl" value={value.consentDocumentUrl} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="participant-policy-version" required>
            {t('policy_fields.version')}
          </Label>
          <Input
            aria-describedby={describedBy('version')}
            aria-invalid={Boolean(errors.version)}
            id="participant-policy-version"
            maxLength={128}
            onChange={(event) => onChange('version', event.target.value)}
            placeholder="consent-2026-08-17"
            required
            value={value.version}
          />
          <FieldError errors={errors} field="version" value={value.version} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="participant-policy-effectiveAt" required>
            {t('policy_fields.effective_at')}
          </Label>
          <Input
            aria-describedby={describedBy('effectiveAt')}
            aria-invalid={Boolean(errors.effectiveAt)}
            id="participant-policy-effectiveAt"
            onChange={(event) => onChange('effectiveAt', event.target.value)}
            placeholder="2026-08-17T09:30:00-05:00"
            required
            value={value.effectiveAt}
          />
          <FieldHint>{t('policy_fields.effective_hint')}</FieldHint>
          <FieldError errors={errors} field="effectiveAt" value={value.effectiveAt} />
        </div>
      </div>
    </fieldset>
  );
}
