// Cases for web-i18n-object-label (.tsx). object-label.ts holds the plain-.ts twin.
export function cases(t: (k: string) => string, name: string, label: string) {
  return [
    { label: 'Daily summary export', value: 'daily' }, // FIRE: web-i18n-object-label
    { title: "Delete this study" }, // FIRE: web-i18n-object-label
    { description: `Remove ${name} from the study` }, // FIRE: web-i18n-object-label
    { message: 'Upload failed', code: 1 }, // FIRE: web-i18n-object-label
    { placeholder: 'Enter a name' }, // FIRE: web-i18n-object-label
    { helperText: 'Shown under the field' }, // FIRE: web-i18n-object-label
    { tooltip: 'More about this', heading: 'Section heading', subtitle: 'Sub title', caption: 'Photo caption' }, // FIRE: web-i18n-object-label, web-i18n-object-label, web-i18n-object-label, web-i18n-object-label
    {
      label: // FIRE: web-i18n-object-label
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
