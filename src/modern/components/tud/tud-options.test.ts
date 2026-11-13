import { describe, expect, test } from 'bun:test';

import { ARRAY_CANONICAL_VALUES, LanguageCodes } from '@/i18n/language-codes';
import { createTranslator } from '@/i18n/translator';
import { optionsFromArray } from './tud-options';

const ctxFor = (code: string) => ({
  effectiveCode: code,
  enTranslator: createTranslator(LanguageCodes.ENGLISH),
  translator: createTranslator(code),
});

describe('optionsFromArray stored values', () => {
  test('Hebrew language options store the languages they name, not the English list by position', () => {
    for (const code of [LanguageCodes.HEBREW_MALE, LanguageCodes.HEBREW_FEMALE]) {
      const options = optionsFromArray(ctxFor(code), 'language_options');
      expect(options.map((o) => o.value)).toEqual(['English', 'Arabic', 'Russian', 'French', 'Spanish', 'Other']);
    }
  });

  test('every canonical-value list matches its localized list one to one', () => {
    for (const [code, lists] of Object.entries(ARRAY_CANONICAL_VALUES)) {
      for (const [key, values] of Object.entries(lists)) {
        expect([code, key, createTranslator(code).tArray(key).length]).toEqual([code, key, values.length]);
      }
    }
  });

  test('languages whose list is the English list keep storing the English values', () => {
    const english = createTranslator(LanguageCodes.ENGLISH).tArray('language_options');
    for (const code of [LanguageCodes.GERMAN, LanguageCodes.SPANISH, LanguageCodes.SWEDISH]) {
      expect(optionsFromArray(ctxFor(code), 'language_options').map((o) => o.value)).toEqual(english);
    }
  });
});
