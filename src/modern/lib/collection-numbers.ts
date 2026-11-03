import { type Translator, translateCatalog } from '@/i18n';
import { COLLECTION_MODULES, INTERVAL_CONFIGURABLE_MODULES } from '@/lib/study-constants';
import { type StudyFormData, studyFieldName } from '@/lib/study-form-model';

/** The bounds already offered by the collection controls, also checked before serialization. */
export const COLLECTION_NUMBER_BOUNDS = {
  rateHz: { min: 1, max: 200, label: 'sampling_rate' },
  dutyActive: { min: 0, label: 'duty_active' },
  dutyPeriod: { min: 1, label: 'duty_period' },
  intervalSeconds: { min: 60, label: 'collection_interval' },
  gridRows: { min: 1, max: 20, label: 'grid_rows' },
  gridCols: { min: 1, max: 20, label: 'grid_cols' },
} as const;
type NumberField = keyof typeof COLLECTION_NUMBER_BOUNDS;

export function isCollectionNumber(field: NumberField, value: string | undefined): boolean {
  const rule: { min: number; max?: number } = COLLECTION_NUMBER_BOUNDS[field];
  const number = Number(value);
  return (
    Boolean(value?.trim()) &&
    Number.isSafeInteger(number) &&
    number >= rule.min &&
    (rule.max === undefined || number <= rule.max)
  );
}

export function collectionNumberValidationProblems(form: StudyFormData, t: Translator['t']) {
  return COLLECTION_MODULES.flatMap((module) => {
    const draft = form.modules[module.value];
    if (!module.alwaysOn && draft.mode === 'disabled') return [];
    const values: Partial<Record<NumberField, string | undefined>> = {
      ...(module.sensorType
        ? {
            rateHz: draft.sensorPolicy?.rateHz,
            dutyActive: draft.sensorPolicy?.dutyActive,
            dutyPeriod: draft.sensorPolicy?.dutyPeriod,
          }
        : {}),
      ...(draft.interaction ? { gridRows: draft.interaction.gridRows, gridCols: draft.interaction.gridCols } : {}),
      ...(INTERVAL_CONFIGURABLE_MODULES.has(module.value) ? { intervalSeconds: draft.intervalSeconds } : {}),
    };
    const problems = (Object.entries(values) as [NumberField, string | undefined][]).flatMap(([field, value]) => {
      const rule: { min: number; max?: number; label: (typeof COLLECTION_NUMBER_BOUNDS)[NumberField]['label'] } =
        COLLECTION_NUMBER_BOUNDS[field];
      if (isCollectionNumber(field, value)) return [];
      return [
        {
          fieldId: studyFieldName.collectionNumber(module.value, field),
          message: t(
            rule.max === undefined ? 'study_form.collection_number_min' : 'study_form.collection_number_range',
            {
              module: translateCatalog(t, 'module', module.value, module.label),
              field: t(`study_form.${rule.label}`),
              min: rule.min,
              max: rule.max ?? '',
            },
          ),
        },
      ];
    });
    if (module.sensorType && Number(values.dutyActive) > Number(values.dutyPeriod))
      problems.push({
        fieldId: studyFieldName.collectionNumber(module.value, 'dutyActive'),
        message: t('study_form.duty_active_exceeds_period'),
      });
    return problems;
  });
}
