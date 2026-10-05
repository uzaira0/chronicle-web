import { useEffect } from 'react';
import { useTranslator } from '@/i18n';

import type { FieldDef } from './tud-schema';

// Generic, controlled field controls the TUD renderer is built from. Each is a thin
// shell over the FieldDef produced by tud-schema; the answer values they read/write
// are the english canonical option values (and canonical "HH:MM" 24h times), which is
// exactly what the submit builder consumes. The "Other" branch folds free text into
// the stored value so no companion answer key leaks into the payload.

export const OTHER_VALUE = 'Other';

export type FieldValue = string | string[] | undefined;

interface ControlProps {
  controlId?: string;
  field: FieldDef;
  labelledBy?: string;
  value: FieldValue;
  onChange: (code: string, value: FieldValue) => void;
  invalid?: boolean;
}

function optionValues(field: FieldDef): Set<string> {
  return new Set((field.options ?? []).map((o) => o.value));
}

/** The single free-text element of an array (the value not matching a known option). */
function freeTextOf(values: string[], known: Set<string>): string | undefined {
  return values.find((v) => !known.has(v) && v !== OTHER_VALUE);
}

export function RadioControl({ field, invalid, labelledBy, onChange, value }: ControlProps) {
  const selected = typeof value === 'string' ? value : '';
  const known = optionValues(field);
  const otherActive = field.withOther === true && selected !== '' && !known.has(selected);
  return (
    <fieldset aria-invalid={invalid} aria-labelledby={labelledBy} className="space-y-2">
      {(field.options ?? []).map((option) => (
        <label className={optionClass(selected === option.value)} key={option.value}>
          <input
            checked={selected === option.value}
            className="h-4 w-4 border-border text-primary focus:ring-primary"
            name={field.code}
            onChange={() => onChange(field.code, option.value)}
            type="radio"
          />
          <span>{option.label}</span>
        </label>
      ))}
      {field.withOther && (
        <OtherRow
          active={otherActive}
          onToggle={(on) => onChange(field.code, on ? OTHER_VALUE : '')}
          onText={(text) => onChange(field.code, text === '' ? OTHER_VALUE : text)}
          text={otherActive ? selected : ''}
        />
      )}
    </fieldset>
  );
}

export function CheckboxControl({ field, invalid, labelledBy, onChange, value }: ControlProps) {
  const values = Array.isArray(value) ? value : [];
  const known = optionValues(field);
  const otherText = freeTextOf(values, known);
  const otherActive = field.withOther === true && (otherText !== undefined || values.includes(OTHER_VALUE));

  const toggle = (optionValue: string, checked: boolean) => {
    const next = checked ? [...new Set([...values, optionValue])] : values.filter((v) => v !== optionValue);
    onChange(field.code, next);
  };
  const setOther = (on: boolean, text: string) => {
    const base = values.filter((v) => known.has(v));
    if (!on) return onChange(field.code, base);
    return onChange(field.code, [...base, text === '' ? OTHER_VALUE : text]);
  };

  return (
    <fieldset aria-invalid={invalid} aria-labelledby={labelledBy} className="space-y-2">
      {(field.options ?? []).map((option) => (
        <label className={optionClass(values.includes(option.value))} key={option.value}>
          <input
            checked={values.includes(option.value)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            onChange={(event) => toggle(option.value, event.currentTarget.checked)}
            type="checkbox"
          />
          <span>{option.label}</span>
        </label>
      ))}
      {field.withOther && (
        <OtherRow
          active={otherActive}
          onToggle={(on) => setOther(on, otherText ?? '')}
          onText={(text) => setOther(true, text)}
          text={otherText ?? ''}
        />
      )}
    </fieldset>
  );
}

export function TextControl({ controlId, field, invalid, labelledBy, onChange, value }: ControlProps) {
  return (
    <input
      aria-invalid={invalid}
      aria-labelledby={labelledBy}
      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
      id={controlId}
      onChange={(event) => onChange(field.code, event.currentTarget.value)}
      type="text"
      value={typeof value === 'string' ? value : ''}
    />
  );
}

export function TimeControl({ controlId, field, invalid, labelledBy, onChange, value }: ControlProps) {
  const current = typeof value === 'string' && value !== '' ? value : (field.defaultTime ?? '');
  // Commit the displayed default into state on mount. Without this, a participant who
  // accepts the shown time (e.g. 07:00) without editing leaves the answer undefined, so
  // required-validation blocks Next on an apparently-filled field — Next would do nothing.
  useEffect(() => {
    if ((value === undefined || value === '') && field.defaultTime) {
      onChange(field.code, field.defaultTime);
    }
  }, [field.code, field.defaultTime, value, onChange]);
  return (
    <input
      aria-invalid={invalid}
      aria-labelledby={labelledBy}
      className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
      id={controlId}
      onChange={(event) => onChange(field.code, event.currentTarget.value)}
      type="time"
      value={current}
    />
  );
}

function OtherRow({
  active,
  onText,
  onToggle,
  text,
}: {
  active: boolean;
  onText: (text: string) => void;
  onToggle: (on: boolean) => void;
  text: string;
}) {
  const { t } = useTranslator();
  return (
    <div className="space-y-2">
      <label className={optionClass(active)}>
        <input
          checked={active}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          onChange={(event) => onToggle(event.currentTarget.checked)}
          type="checkbox"
        />
        <span>{t('common.other')}</span>
      </label>
      {active && (
        <input
          aria-label={t('common.other_specify')}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          onChange={(event) => onText(event.currentTarget.value)}
          placeholder={t('common.please_specify')}
          type="text"
          value={text}
        />
      )}
    </div>
  );
}

function optionClass(active: boolean): string {
  return `flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
    active ? 'border-primary bg-primary/5' : 'border-border/70 bg-muted/30'
  }`;
}

const CONTROLS = {
  checkbox: CheckboxControl,
  radio: RadioControl,
  text: TextControl,
  time: TimeControl,
} as const;

export function FieldControl(props: ControlProps) {
  const { t } = useTranslator();
  const Control = CONTROLS[props.field.widget];
  const controlId = `tud-field-${props.field.code}`;
  const labelId = `${controlId}-label`;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground" id={labelId}>
        {props.field.title}
      </p>
      {props.field.description && <p className="text-xs text-muted-foreground">{props.field.description}</p>}
      <Control {...props} controlId={controlId} labelledBy={labelId} />
      {props.invalid && <p className="text-xs text-destructive">{t('common.response_required')}</p>}
    </div>
  );
}

/** The 12/24-hour clock-format selector shown on the intro page (parity feature). */
export function ClockFormatSelect({
  label,
  labels,
  onChange,
  value,
}: {
  label?: string;
  labels: string[];
  onChange: (format: 12 | 24) => void;
  value: 12 | 24;
}) {
  return (
    <fieldset aria-label={label} className="space-y-2">
      {([12, 24] as const).map((format, index) => (
        <label className={optionClass(value === format)} key={format}>
          <input
            checked={value === format}
            className="h-4 w-4 border-border text-primary focus:ring-primary"
            name="clockFormat"
            onChange={() => onChange(format)}
            type="radio"
          />
          <span>{labels[index] ?? String(format)}</span>
        </label>
      ))}
    </fieldset>
  );
}
