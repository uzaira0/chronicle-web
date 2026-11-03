// A contained reimplementation of the exact i18next subset the Time Use Diary
// wording relies on. The Bun build does not bundle the i18next runtime, so this
// resolver provides the four
// behaviors the translation tables actually exercise:
//
//   1. `$t(other.key)` cross-references (resolved recursively, inheriting options)
//   2. `{{var}}` interpolation from the options object
//   3. `_context` suffixing: t('intro_text', {context:'today'}) prefers
//      'intro_text_today', falling back to 'intro_text'
//   4. returning arrays/objects verbatim (i18next `returnObjects`) with the same
//      string processing applied to every leaf
//   5. `_one` plurals: t('k', {count: 1}) prefers 'k_one', falling back to 'k'
//      (CLDR one/other, the only split English and Spanish need)
//
// Keeping this faithful is what makes the form correct-by-construction; the
// translator.test.ts cases pin each behavior against the real tables.

import { LanguageCodes, PSEUDO_LOCALE } from './language-codes';
import { TRANSLATION_TABLES, type TranslationTable } from './translations';

export interface TransOptions {
  context?: string;
  [variable: string]: unknown;
}

const T_REF = /\$t\(([^)]+)\)/g;
const INTERP = /\{\{\s*([^}]+?)\s*\}\}/g;

const PSEUDO_FROM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PSEUDO_TO = 'áƀçðéƒĝĥíĵķļɱñóþǫŕšţúṽŵẋýžÁƁÇÐÉƑĜĤÍĴĶĻḾÑÓÞǪŔŠŢÚṼŴẊÝŽ';

/** Accent every letter of a template, leaving `{{vars}}` and `$t(refs)` intact for interpolation. */
function pseudolocalize(template: string): string {
  return template.replace(/\{\{[^}]*\}\}|\$t\([^)]*\)|[A-Za-z]/g, (m) =>
    m.length === 1 ? (PSEUDO_TO[PSEUDO_FROM.indexOf(m)] ?? m) : m,
  );
}

function primitiveToString(value: unknown): string | null {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'bigint':
    case 'boolean':
      return String(value);
    default:
      return null;
  }
}

function lookupPath(table: TranslationTable, dottedKey: string): unknown {
  let node: unknown = table;
  for (const segment of dottedKey.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

// i18next key order: `${key}_${context}_one`, `${key}_${context}`, `${key}_one`, then the bare key.
function candidateKeys(key: string, options: TransOptions): string[] {
  const bases = options.context ? [`${key}_${options.context}`, key] : [key];
  return Number(options.count) === 1 ? bases.flatMap((base) => [`${base}_one`, base]) : bases;
}

export type Translator = {
  /** Resolve a translation key to a string (the common case). */
  t: (key: string, options?: TransOptions) => string;
  /** Resolve a key whose value is an array of option strings. */
  tArray: (key: string, options?: TransOptions) => string[];
  /** Resolve a key whose value is a string->string object (e.g. primary_activities). */
  tObject: (key: string, options?: TransOptions) => Record<string, string>;
  /** The effective (resolved) language code backing this translator. */
  readonly language: string;
};

export function createTranslator(effectiveCode: string): Translator {
  const english: TranslationTable = TRANSLATION_TABLES[LanguageCodes.ENGLISH] ?? {};
  const pseudo = effectiveCode === PSEUDO_LOCALE;
  const table: TranslationTable = pseudo ? english : (TRANSLATION_TABLES[effectiveCode] ?? english);

  // Upstream initialised i18next with `fallbackLng: en`, so a key a language table lacks
  // renders in English rather than as its raw key. Only a key absent everywhere echoes.
  // An empty string in a language table is an untranslated placeholder, not a translation:
  // upstream ran with i18next's `returnEmptyString: false`, so it fell back to English
  // rather than rendering a blank label on a required question. Matched here.
  // The active table answers with any candidate before English is consulted, as in i18next.
  function lookup(key: string, options: TransOptions): unknown {
    const keys = candidateKeys(key, options);
    for (const source of [table, english]) {
      for (const candidate of keys) {
        const raw = lookupPath(source, candidate);
        if (raw !== undefined && raw !== '') return raw;
      }
    }
    return lookupPath(english, key);
  }

  function renderString(raw: string, options: TransOptions): string {
    const withRefs = (pseudo ? pseudolocalize(raw) : raw).replace(T_REF, (_match, inner: string) =>
      resolve(inner.trim(), options),
    );
    return withRefs.replace(INTERP, (match, name: string) => {
      const value = options[name.trim()];
      return primitiveToString(value) ?? match;
    });
  }

  function resolve(key: string, options: TransOptions): string {
    const raw = lookup(key, options);
    if (typeof raw === 'string') return renderString(raw, options);
    if (raw === undefined) return key; // absent in every table -> echo the key (i18next default)
    return primitiveToString(raw) ?? key;
  }

  function resolveArray(key: string, options: TransOptions): string[] {
    const raw = lookup(key, options);
    if (!Array.isArray(raw)) return [];
    return raw.map((el) => (typeof el === 'string' ? renderString(el, options) : String(el)));
  }

  function resolveObject(key: string, options: TransOptions): Record<string, string> {
    const raw = lookup(key, options);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      out[k] = typeof v === 'string' ? renderString(v, options) : String(v);
    }
    return out;
  }

  return {
    language: effectiveCode,
    t: (key, options = {}) => resolve(key, options),
    tArray: (key, options = {}) => resolveArray(key, options),
    tObject: (key, options = {}) => resolveObject(key, options),
  };
}
