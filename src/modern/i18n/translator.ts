// A contained reimplementation of the exact i18next subset the Time Use Diary
// wording relies on — nothing more. The legacy form used the full i18next runtime;
// the Bun build does not bundle it, so this resolver provides the four
// behaviors the translation tables actually exercise:
//
//   1. `$t(other.key)` cross-references (resolved recursively, inheriting options)
//   2. `{{var}}` interpolation from the options object
//   3. `_context` suffixing: t('intro_text', {context:'today'}) prefers
//      'intro_text_today', falling back to 'intro_text'
//   4. returning arrays/objects verbatim (i18next `returnObjects`) with the same
//      string processing applied to every leaf
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
export function pseudolocalize(template: string): string {
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

// i18next context: try `${key}_${context}` first, then the bare key.
function resolveRaw(table: TranslationTable, key: string, context?: string): unknown {
  if (context) {
    const contextual = lookupPath(table, `${key}_${context}`);
    if (contextual !== undefined) return contextual;
  }
  return lookupPath(table, key);
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
  function lookup(key: string, context?: string): unknown {
    const raw = resolveRaw(table, key, context);
    return raw === undefined ? resolveRaw(english, key, context) : raw;
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
    const raw = lookup(key, options.context);
    if (typeof raw === 'string') return renderString(raw, options);
    if (raw === undefined) return key; // absent in every table -> echo the key (i18next default)
    return primitiveToString(raw) ?? key;
  }

  function resolveArray(key: string, options: TransOptions): string[] {
    const raw = lookup(key, options.context);
    if (!Array.isArray(raw)) return [];
    return raw.map((el) => (typeof el === 'string' ? renderString(el, options) : String(el)));
  }

  function resolveObject(key: string, options: TransOptions): Record<string, string> {
    const raw = lookup(key, options.context);
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
