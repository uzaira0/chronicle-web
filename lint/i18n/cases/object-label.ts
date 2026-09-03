// Cases for web-i18n-object-label-ts (plain .ts twin of object-label.tsx).
export function cases(t: (k: string) => string, name: string, label: string) {
  return [
    { label: 'Daily summary export', value: 'daily' }, // FIRE: web-i18n-object-label-ts
    { title: "Delete this study" }, // FIRE: web-i18n-object-label-ts
    { description: `Remove ${name} from the study` }, // FIRE: web-i18n-object-label-ts
    { message: 'Upload failed', code: 1 }, // FIRE: web-i18n-object-label-ts
    { placeholder: 'Enter a name' }, // FIRE: web-i18n-object-label-ts
    { helperText: 'Shown under the field' }, // FIRE: web-i18n-object-label-ts
    { tooltip: 'More about this', heading: 'Section heading', subtitle: 'Sub title', caption: 'Photo caption' }, // FIRE: web-i18n-object-label-ts, web-i18n-object-label-ts, web-i18n-object-label-ts, web-i18n-object-label-ts
    {
      label: // FIRE: web-i18n-object-label-ts
        'Split across lines',
    },
    { label: t('exports.daily') },
    { label: 'daily' },
    { value: 'Daily summary' },
    { label },
    { label: label },
    { label: 'DayTime' },
    { label: `${name}` },
    { label: 'A' + ' b' },
    { 'label': 'Quoted key is not matched' },
    { label: 'ms' },
  ];
}
// Documented holes: a single-word value ('daily', 'DayTime') and a quoted key ('label') are not
// matched; the former is usually a wire value, the latter never occurs in this codebase.
