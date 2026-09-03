import { getBaseLanguageCode, isGenderedLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from './language-codes';
import { useTranslator } from './language-context';
import type { Translator } from './translator';

/**
 * A language's own name for itself. `language-codes` carries the English exonym as the
 * built-in default (Hebrew already ships its endonym); a table may replace it under
 * `language_names.<base code>` so the picker reads natively in every language.
 */
function languageName(t: Translator['t'], lang: SupportedLanguage): string {
  const key = `language_names.${lang.code}`;
  const translated = t(key);
  return translated === key ? lang.language : translated;
}

type LanguageSwitcherProps = {
  /** Override the rendered selection (a form with its own local language state). */
  effectiveCode?: string;
  /** Override the change handler; defaults to switching the app-wide language. */
  onSelect?: (base: string) => void;
};

/** Participant-facing language picker; bound to the app-wide language unless overridden. */
export function LanguageSwitcher({ effectiveCode, onSelect }: LanguageSwitcherProps) {
  const language = useTranslator();
  const current = effectiveCode ?? language.effectiveCode;
  const select =
    onSelect ??
    ((base: string) => {
      // Keep the current gendered variant when switching within a gendered language.
      const gender = isGenderedLanguage(base) && current.endsWith('female') ? 'female' : null;
      language.setLanguage(base, gender);
    });
  return (
    <select
      aria-label={language.t('common.language')}
      className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
      onChange={(event) => select(event.currentTarget.value)}
      value={getBaseLanguageCode(current)}
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {languageName(language.t, lang)}
        </option>
      ))}
    </select>
  );
}
