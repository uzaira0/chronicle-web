import { describe, expect, test } from 'bun:test';

import {
  ARRAY_ORDER_PERMUTATIONS,
  getBaseLanguageCode,
  isGenderedLanguage,
  isRtlLanguage,
  LanguageCodes,
  resolveLanguageCode,
  SUPPORTED_BASE_CODES,
} from './language-codes';
import { createTranslator } from './translator';

describe('createTranslator — i18next subset fidelity', () => {
  const en = createTranslator('en');

  test('resolves $t() cross-reference with context (intro_text today vs yesterday)', () => {
    const today = en.t('intro_text', { context: 'today' });
    const yesterday = en.t('intro_text', { context: 'yesterday' });
    expect(today).toContain('ask how your child slept last night');
    expect(today).toContain('starting when your child woke up this morning');
    expect(yesterday).toContain('describe everything your child did yesterday');
    expect(today).not.toEqual(yesterday);
  });

  test('resolves nested $t() that itself depends on context (day_of_week)', () => {
    const today = en.t('day_of_week', { activityDay: 'today', context: 'today' });
    const yesterday = en.t('day_of_week', { activityDay: 'yesterday', context: 'yesterday' });
    // nested $t(day_of_week_ctx.what_dow) -> what_dow_today / what_dow_yesterday
    expect(today).toContain('is today');
    expect(today).toContain('for today');
    expect(yesterday).toContain('was yesterday');
    expect(yesterday).toContain('for yesterday');
  });

  test('interpolates {{var}} placeholders', () => {
    const out = en.t('typical_day', { activityDay: 'Monday', day: 'weekday' });
    expect(out).toContain('Was Monday a typical weekday');
    expect(out).not.toContain('{{');
  });

  test('leaves placeholder intact when a variable is not supplied', () => {
    const out = en.t('typical_day', {});
    expect(out).toContain('{{activityDay}}');
  });

  test('echoes the key when it is missing', () => {
    expect(en.t('this_key_does_not_exist')).toBe('this_key_does_not_exist');
  });

  test('falls back to the English table for a key another language lacks', () => {
    // Only upstream-verified translations ship; a key a language table lacks renders in
    // English (upstream's fallbackLng) until a verified translator supplies it.
    const sv = createTranslator('sv');
    expect(sv.t('app_usage_survey.user_options.parent_alone')).toBe('Parent alone');
  });

  test('tArray returns option arrays verbatim and interpolates each element', () => {
    expect(en.tArray('weekday_options')).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    const choices = en.tArray('typical_day_choices', { activityDay: 'Monday' });
    expect(choices).toEqual(['Yes, Monday was typical.', 'No, Monday was non-typical.']);
  });

  test('tObject returns the primary-activities map', () => {
    const activities = en.tObject('primary_activities');
    expect(activities.napping).toBe('Napping/sleeping');
    expect(activities.media_use).toBe('Using screen media (videos, apps, chat, etc.)');
  });

  test('falls back to English for an unknown effective code', () => {
    const unknown = createTranslator('zz');
    expect(unknown.t('yes')).toBe('Yes');
  });
});

describe('Hebrew gendered translation tables', () => {
  test('he-male and he-female resolve to distinct, non-English tables', () => {
    const male = createTranslator(LanguageCodes.HEBREW_MALE);
    const female = createTranslator(LanguageCodes.HEBREW_FEMALE);
    expect(male.t('yes')).toBe('כן');
    expect(female.t('yes')).toBe('כן');
    // weekday options are Hebrew, Sunday-first
    expect(male.tArray('weekday_options')[0]).toBe('יום ראשון');
    expect(female.tArray('weekday_options')).toHaveLength(7);
  });
});

describe('language-code resolution', () => {
  test('resolveLanguageCode maps he + gender to the gendered table', () => {
    expect(resolveLanguageCode('he', 'female')).toBe('he-female');
    expect(resolveLanguageCode('he', 'male')).toBe('he-male');
    expect(resolveLanguageCode('he')).toBe('he-male'); // defaults to male
    expect(resolveLanguageCode('he', 'nonsense')).toBe('he-male');
  });

  test('resolveLanguageCode passes ungendered codes through', () => {
    expect(resolveLanguageCode('en', 'female')).toBe('en');
    expect(resolveLanguageCode('sv')).toBe('sv');
  });

  test('the en-XA pseudo-locale accents template text but not interpolated values', () => {
    expect(createTranslator('en-XA').t('non_typical_day', { activityDay: 'Monday' })).toBe(
      'Ŵĥáţ ɱáðé Monday á ñóñ-ţýþíçáļ ðáý?',
    );
  });

  test('getBaseLanguageCode inverts the gendered mapping', () => {
    expect(getBaseLanguageCode('he-male')).toBe('he');
    expect(getBaseLanguageCode('he-female')).toBe('he');
    expect(getBaseLanguageCode('en')).toBe('en');
  });

  test('isGenderedLanguage / isRtlLanguage classify Hebrew', () => {
    expect(isGenderedLanguage('he')).toBe(true);
    expect(isGenderedLanguage('en')).toBe(false);
    expect(isRtlLanguage('he-female')).toBe(true);
    expect(isRtlLanguage('he-male')).toBe(true);
    expect(isRtlLanguage('en')).toBe(false);
  });

  test('SUPPORTED_BASE_CODES is the picker set', () => {
    expect(SUPPORTED_BASE_CODES.has('he')).toBe(true);
    expect(SUPPORTED_BASE_CODES.has('en')).toBe(true);
    expect(SUPPORTED_BASE_CODES.has('he-male')).toBe(false);
  });

  test('ARRAY_ORDER_PERMUTATIONS reorders Hebrew weekdays Sunday-first to English Monday-first', () => {
    expect(ARRAY_ORDER_PERMUTATIONS['he-male']?.weekday_options).toEqual([6, 0, 1, 2, 3, 4, 5]);
    expect(ARRAY_ORDER_PERMUTATIONS['he-female']?.weekday_options).toEqual([6, 0, 1, 2, 3, 4, 5]);
  });
});

// `bed_time_tonight` is an empty string in the Swedish table. An empty value must not win over
// the English fallback, or the today-diary bed-time question renders with no title.
describe('createTranslator — empty values fall back to English', () => {
  test('an empty Swedish value renders the English text, not a blank label', () => {
    const sv = createTranslator('sv');
    expect(sv.t('bed_time_tonight')).toBe(createTranslator('en').t('bed_time_tonight'));
    expect(sv.t('bed_time_tonight')).not.toBe('');
  });

  test('an empty value reached through a $t() context reference also falls back', () => {
    const sv = createTranslator('sv');
    expect(sv.t('day_end_time_ctx.bed_time', { context: 'today' })).toBe(createTranslator('en').t('bed_time_tonight'));
  });

  test('a translated Spanish value still wins over English', () => {
    expect(createTranslator('es').t('button_next')).toBe('Siguiente');
  });
});

// i18next plurals, CLDR one/other (the only split English and Spanish need): a count of 1
// prefers `<key>_one` in the active table, then the bare key, then English.
describe('createTranslator — _one plural forms', () => {
  const es = createTranslator('es');

  test('a count of one picks the _one row, as a number or the string the pages pass', () => {
    expect(es.t('participants.selected_count', { count: '1' })).toBe('1 seleccionado');
    expect(es.t('participants.selected_count', { count: 1 })).toBe('1 seleccionado');
    expect(es.t('modules_panel.required_count', { count: '1' })).toBe('1 obligatorio');
    expect(es.t('participants.show_more', { count: 1, hidden: 1, step: 50 })).toBe('Mostrar 50 más (1 oculto)');
  });

  test('any other count keeps the plural row', () => {
    for (const count of ['0', '2', '11']) {
      expect(es.t('participants.selected_count', { count })).toBe(`${count} seleccionados`);
    }
    expect(es.t('participants.selected_count')).toBe('{{count}} seleccionados');
  });

  test('a key without a _one row renders its bare form for a count of one', () => {
    expect(es.t('participants.diagnostics_page', { count: 1, page: 1 })).toBe('Página 1');
    expect(createTranslator('en').t('participants.diagnostics_page', { count: 1, page: 1 })).toBe('Page 1');
  });

  test('a language without the key falls back to the English _one row', () => {
    expect(createTranslator('sv').t('participants.selected_count', { count: 1 })).toBe(
      createTranslator('en').t('participants.selected_count_one', { count: 1 }),
    );
  });
});
