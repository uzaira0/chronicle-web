import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  getBaseLanguageCode,
  isRtlLanguage,
  LanguageCodes,
  PSEUDO_LOCALE,
  resolveLanguageCode,
  SUPPORTED_BASE_CODES,
} from './language-codes';
import { createTranslator, type Translator } from './translator';

// Upstream persisted the participant's choice in a cookie read by i18next's language
// detector; the modern shell keeps the same intent with one localStorage key.
const STORAGE_KEY = 'chronicle.language';

export type LanguageContextValue = Translator & {
  /** The resolved translation-table code currently rendering (e.g. "es", "he-female"). */
  effectiveCode: string;
  /** Switch language by base code; gender only matters for gendered tables (Hebrew). */
  setLanguage: (baseCode: string, gender?: string | null) => void;
};

let currentEffectiveCode: string = LanguageCodes.ENGLISH;

/** The language the provider is rendering, for code that runs outside React (class components). */
export function getCurrentLanguage(): string {
  return currentEffectiveCode;
}

function readStoredLanguage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeLanguage(effectiveCode: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, effectiveCode);
  } catch {
    // Storage may be unavailable (private mode, blocked site data); the choice still applies in-page.
  }
}

/**
 * Resolve the initial language: an explicit `?lang=` (+ `?gender=`) on a participant link wins,
 * then a stored choice, then the browser language, then English — the same precedence upstream's
 * i18next detector applied.
 */
export function resolveInitialLanguage(search: string, stored: string | null, navigatorLanguage: string): string {
  const params = new URLSearchParams(search);
  const requested = params.get('lang');
  if (requested === PSEUDO_LOCALE) return PSEUDO_LOCALE;
  if (requested && SUPPORTED_BASE_CODES.has(requested)) return resolveLanguageCode(requested, params.get('gender'));
  if (stored) return stored;
  const browserBase = navigatorLanguage.toLowerCase().split('-')[0] ?? '';
  if (SUPPORTED_BASE_CODES.has(browserBase)) return resolveLanguageCode(browserBase, null);
  return LanguageCodes.ENGLISH;
}

function buildValue(effectiveCode: string, setLanguage: LanguageContextValue['setLanguage']): LanguageContextValue {
  return { ...createTranslator(effectiveCode), effectiveCode, setLanguage };
}

const ENGLISH_ONLY: LanguageContextValue = buildValue(LanguageCodes.ENGLISH, () => {});

const LanguageContext = createContext<LanguageContextValue>(ENGLISH_ONLY);

type LanguageProviderProps = PropsWithChildren<{
  /** Query string used to seed the language (defaults to the page URL). */
  initialSearch?: string;
}>;

export function LanguageProvider({ children, initialSearch }: LanguageProviderProps) {
  const [effectiveCode, setEffectiveCode] = useState(() => {
    const search = initialSearch ?? (typeof window === 'undefined' ? '' : window.location.search);
    const navigatorLanguage = typeof navigator === 'undefined' ? '' : navigator.language;
    return resolveInitialLanguage(search, readStoredLanguage(), navigatorLanguage);
  });
  currentEffectiveCode = effectiveCode;

  const setLanguage = useCallback<LanguageContextValue['setLanguage']>((baseCode, gender) => {
    if (!SUPPORTED_BASE_CODES.has(baseCode)) return;
    const next = resolveLanguageCode(baseCode, gender);
    currentEffectiveCode = next;
    storeLanguage(next);
    setEffectiveCode(next);
  }, []);

  // The document shipped as `<html lang="en" >`; assistive tech reads the whole page in that
  // language until the root element is told otherwise.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = getBaseLanguageCode(effectiveCode);
    document.documentElement.dir = isRtlLanguage(effectiveCode) ? 'rtl' : 'ltr';
  }, [effectiveCode]);

  const value = useMemo(() => buildValue(effectiveCode, setLanguage), [effectiveCode, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Translator for the active language plus the switcher. Renders English outside a provider. */
export function useTranslator(): LanguageContextValue {
  return useContext(LanguageContext);
}
