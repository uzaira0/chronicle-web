import { describe, expect, test } from 'bun:test';

import { evaluateRedcap, isShown, type RedcapRecord, referencedFields } from '@/components/tud/redcap/redcap-logic';
import {
  type Combo,
  choiceLabel,
  mulberry32,
  pipe,
  redcapShown,
  toRecord,
  variableFor,
  type WalkedPage,
  walkDiary,
} from '@/test/tud-redcap-walk';
import type { ActivityDay } from '../tud-flow';
import { buildPage } from '../tud-schema';
import {
  blockVariable,
  buildRedcapFields,
  dayVariable,
  lastFlagVariable,
  OTHER_CODE,
  optionContext,
  type RedcapField,
  settingsForVariant,
  type TudVariant,
  toCodebookCsv,
  toDictionaryCsv,
} from './redcap-dictionary';
import { hiddenChoices, parseCsv } from './redcap-export';

const LANGUAGES = ['en', 'de', 'es', 'sv', 'he-male', 'he-female'] as const;
const TODAY_LANGUAGES = new Set(['en', 'de', 'he-male', 'he-female']);
const VARIANTS: TudVariant[] = ['standard', 'osu', 'sherbrooke'];
const DAYS: ActivityDay[] = ['today', 'yesterday'];
const MAX = 12;

const COMBOS: Combo[] = LANGUAGES.flatMap((language) =>
  DAYS.filter((day) => day === 'yesterday' || TODAY_LANGUAGES.has(language)).flatMap((activityDay) =>
    VARIANTS.map((variant) => ({ activityDay, language, variant })),
  ),
);

const cache = new Map<string, RedcapField[]>();
function fieldsFor(combo: Combo, maxActivities = MAX): RedcapField[] {
  const key = `${combo.language}/${combo.activityDay}/${combo.variant}/${maxActivities}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const fields = buildRedcapFields({ ...combo, maxActivities });
  cache.set(key, fields);
  return fields;
}

const field = (fields: RedcapField[], variable: string) => fields.find((f) => f.variable === variable) as RedcapField;

// ---- structure -------------------------------------------------------------------------------

function checkReference(
  fields: RedcapField[],
  position: Map<string, number>,
  index: number,
  name: string,
  code?: string,
) {
  const at = position.get(name);
  expect(at, `${fields[index]?.variable} references unknown [${name}]`).toBeDefined();
  // Logic, calcs and piping read earlier fields or fields on the same page.
  expect(at as number).toBeLessThanOrEqual(index);
  if (code === undefined) return;
  const target = fields[at as number] as RedcapField;
  expect([target.variable, target.type]).toEqual([target.variable, 'checkbox']);
  expect(target.codes?.some((c) => c.code === code)).toBe(true);
}

function checkReferences(fields: RedcapField[]) {
  const position = new Map(fields.map((f, i) => [f.variable, i]));
  fields.forEach((f, index) => {
    const texts = [f.branching, f.annotation, f.type === 'calc' ? f.choices : '', f.label, f.sectionHeader];
    for (const ref of texts.flatMap(referencedFields)) checkReference(fields, position, index, ref.name, ref.code);
  });
}

// Within one day and variant, a variable's code must mean one stored value in every
// language, and a stored value must have one code.
function checkCodesAgree(activityDay: ActivityDay, variant: TudVariant) {
  const combos = COMBOS.filter((c) => c.activityDay === activityDay && c.variant === variant);
  const english = fieldsFor({ activityDay, language: 'en', variant });
  const pairs = new Set<string>();
  for (const combo of combos) {
    const fields = fieldsFor(combo);
    expect(fields.map((f) => [f.variable, f.branching])).toEqual(english.map((f) => [f.variable, f.branching]));
    for (const f of fields)
      for (const { code, value } of f.codes ?? []) pairs.add(`${f.variable}\u0000${code}\u0000${value}`);
  }
  const byCode = new Map<string, string[]>();
  const byValue = new Map<string, string[]>();
  for (const pair of pairs) {
    const [variable, code, value] = pair.split('\u0000') as [string, string, string];
    byCode.set(`${variable}/${code}`, [...(byCode.get(`${variable}/${code}`) ?? []), value]);
    byValue.set(`${variable}/${value}`, [...(byValue.get(`${variable}/${value}`) ?? []), code]);
  }
  expect([...byCode].filter(([, values]) => values.length > 1)).toEqual([]);
  expect([...byValue].filter(([, codes]) => codes.length > 1)).toEqual([]);
}

describe('TUD REDCap dictionary: structure', () => {
  test('every language, day and variant builds', () => {
    for (const combo of COMBOS) expect(fieldsFor(combo).length).toBeGreaterThan(100);
  });

  test('variable names are valid, at most 26 characters and unique', () => {
    for (const combo of COMBOS) {
      const names = fieldsFor(combo).map((f) => f.variable);
      expect(new Set(names).size).toBe(names.length);
      expect(names.filter((n) => !/^[a-z][a-z0-9_]{0,25}$/.test(n))).toEqual([]);
      expect(names[0]).toBe('record_id');
    }
  });

  test('every reference in logic, calcs, labels and tags names a field defined earlier', () => {
    for (const combo of COMBOS) checkReferences(fieldsFor(combo));
  });

  test('a code means the same stored value in every language, and branching is identical', () => {
    for (const activityDay of DAYS) for (const variant of VARIANTS) checkCodesAgree(activityDay, variant);
  });

  test('Hebrew language choices are coded as the languages they name', () => {
    const he = field(fieldsFor({ activityDay: 'yesterday', language: 'he-female', variant: 'osu' }), 'a01_p_book_lang');
    const en = field(fieldsFor({ activityDay: 'yesterday', language: 'en', variant: 'osu' }), 'a01_p_book_lang');
    expect(he.codes?.map((c) => c.value)).toEqual(['English', 'Arabic', 'Russian', 'French', 'Spanish', 'Other']);
    expect(he.codes?.find((c) => c.value === 'Arabic')?.code).toBe(en.codes?.find((c) => c.value === 'Arabic')?.code);
    expect(he.codes?.find((c) => c.value === 'English')?.code).toBe('10');
  });

  test('the CSV has the 18 REDCap columns on every row and round-trips quoting', () => {
    const fields = fieldsFor({ activityDay: 'yesterday', language: 'he-female', variant: 'standard' });
    const rows = parseCsv(toDictionaryCsv(fields));
    expect(rows[0]?.[0]).toBe('Variable / Field Name');
    expect(rows.length).toBe(fields.length + 1);
    expect(rows.filter((r) => r.length !== 18)).toEqual([]);
    expect(rows.slice(1).map((r) => r[4])).toEqual(fields.map((f) => f.label));
  });

  test('the codebook covers the codes of every language', () => {
    const osu = COMBOS.filter((c) => c.activityDay === 'yesterday' && c.variant === 'osu').map((c) => fieldsFor(c));
    const codebook = parseCsv(toCodebookCsv(osu));
    expect(codebook.filter((r) => r.length !== 5)).toEqual([]);
    expect(codebook).toContainEqual(['a01_p_book_lang', 'primaryBookLanguage', '1', '10', 'English']);
    expect(codebook).toContainEqual(['a01_p_book_lang', 'primaryBookLanguage', '1', '11', 'Russian']);
  });

  test('the secondary-activity choices hide the current activity, as the form drops it', () => {
    const ctx = optionContext('en');
    const fields = fieldsFor({ activityDay: 'yesterday', language: 'en', variant: 'standard' });
    const act = field(fields, blockVariable(3, 'primaryActivity'));
    const sec = field(fields, blockVariable(3, 'secondaryActivity'));
    for (const { code, value } of act.codes ?? []) {
      const hidden = hiddenChoices(sec.annotation, { [act.variable]: code });
      const form = buildPage('contextual', {
        activityDay: 'yesterday',
        carriedActivity: value,
        ctx,
        isFirstActivity: false,
        pageAnswers: { otherActivity: ctx.enTranslator.t('yes') },
        settings: settingsForVariant('standard'),
      }).fields.find((f) => f.code === 'secondaryActivity');
      const shown = (sec.codes ?? []).filter((c) => !hidden.includes(c.code)).map((c) => c.value);
      expect(shown).toEqual((form?.options ?? []).map((o) => o.value));
    }
  });
});

// ---- parity with the form -------------------------------------------------------------------

function checkSameShown(combo: Combo, diaries: number) {
  const fields = fieldsFor(combo);
  const rand = mulberry32(0x7ad + combo.variant.length * 31 + combo.activityDay.length + combo.language.length);
  const ctx = optionContext(combo.language);
  const warnings = fields.filter((f) => f.type === 'descriptive' && f.variable !== 'intro');
  for (let i = 0; i < diaries; i += 1) {
    const { record, expected } = toRecord(walkDiary(rand, combo, 1 + Math.floor(rand() * MAX), ctx), fields);
    const shown = redcapShown(fields, record);
    const missing = [...expected].filter((v) => !shown.has(v));
    const extra = [...shown].filter((v) => !expected.has(v));
    expect({ extra, missing }).toEqual({ extra: [], missing: [] });
    // A valid diary never shows a time warning and never overflows.
    expect(warnings.filter((f) => isShown(f.branching, record)).map((f) => f.variable)).toEqual([]);
    expect(record.activities_overflow).not.toBe('1'); // blank when the last block was never reached
  }
}

function checkPageWording(page: WalkedPage, record: RedcapRecord, byVariable: Map<string, RedcapField>) {
  for (const formField of page.fields) {
    const target = byVariable.get(variableFor(page, formField.code)) as RedcapField;
    expect(pipe(target.label, record, byVariable)).toBe(formField.title);
    const labels = new Map((formField.options ?? []).map((o) => [o.value, o.label]));
    // The form drops the current activity from the secondary list; REDCap hides it by @IF.
    const comparable = (target.codes ?? []).filter((c) => c.code !== OTHER_CODE && labels.has(c.value));
    expect(comparable.map((c) => choiceLabel(target, c.code))).toEqual(
      comparable.map((c) => labels.get(c.value) ?? ''),
    );
  }
}

function checkSameWording(combo: Combo) {
  const fields = fieldsFor(combo);
  const byVariable = new Map(fields.map((f) => [f.variable, f]));
  const ctx = optionContext(combo.language);
  const rand = mulberry32(42 + combo.language.length);
  for (let i = 0; i < 10; i += 1) {
    const pages = walkDiary(rand, combo, 1 + Math.floor(rand() * MAX), ctx);
    const { record } = toRecord(pages, fields);
    for (const page of pages) checkPageWording(page, record, byVariable);
  }
}

describe('TUD REDCap dictionary: parity with the form', () => {
  // Random diaries walked through the real form engine must show exactly the same
  // questions in REDCap as in Chronicle: none missing, none extra.
  for (const combo of COMBOS) {
    test(`same questions shown: ${combo.language}/${combo.activityDay}/${combo.variant}`, () => {
      checkSameShown(combo, combo.language === 'en' ? 150 : 40);
    });
  }

  // REDCap piping ([aNN_act] -> its label, [aNN_end] -> the time) must give the wording the
  // form shows, and every choice label must match, in every language.
  for (const combo of COMBOS) {
    test(`same wording after piping: ${combo.language}/${combo.activityDay}/${combo.variant}`, () => {
      checkSameWording(combo);
    });
  }

  test('an end time before the start shows the warning', () => {
    const combo: Combo = { activityDay: 'yesterday', language: 'en', variant: 'standard' };
    const fields = fieldsFor(combo);
    const pages = walkDiary(mulberry32(7), combo, 3, optionContext('en'), { endBeforeStart: true });
    const { record } = toRecord(pages, fields);
    redcapShown(fields, record);
    expect(isShown(field(fields, 'a01_end_err').branching, record)).toBe(true);
  });

  test('a day with more activities than blocks is flagged, and every block stays open', () => {
    const combo: Combo = { activityDay: 'yesterday', language: 'en', variant: 'standard' };
    const fields = fieldsFor(combo, 3);
    const pages = walkDiary(mulberry32(11), combo, 5, optionContext('en'));
    // Blocks 4 and 5 have no fields in a 3-block dictionary.
    const { record } = toRecord(
      pages.filter((p) => p.block <= 3),
      fields,
    );
    const shown = redcapShown(fields, record);
    expect(shown.has(blockVariable(3, 'primaryActivity'))).toBe(true);
    expect(record.activities_overflow).toBe('1');
  });

  test('ending the day earlier closes every later block', () => {
    const combo: Combo = { activityDay: 'yesterday', language: 'en', variant: 'standard' };
    const fields = fieldsFor(combo);
    const { record } = toRecord(walkDiary(mulberry32(5), combo, 6, optionContext('en')), fields);
    redcapShown(fields, record);
    // The participant goes back to activity 2 and sets its end to the day end. Only the page
    // holding a02_end is saved again, so a02_last is recomputed; later flags keep old values.
    record[blockVariable(2, 'activityEndTime')] = record[dayVariable('dayEndTime')] as string;
    const flag = field(fields, lastFlagVariable(2));
    record[flag.variable] = String(evaluateRedcap(flag.choices, record));
    for (let block = 3; block <= 6; block += 1) {
      expect(isShown(field(fields, blockVariable(block, 'primaryActivity')).branching, record)).toBe(false);
    }
  });
});

describe('TUD REDCap dictionary: answers left behind by going back', () => {
  test('every field of a later block, hidden calcs included, carries the block condition', () => {
    // A page whose fields are all hidden is skipped; an unconditional field would leave a
    // blank page for every closed block.
    const fields = fieldsFor({ activityDay: 'yesterday', language: 'en', variant: 'standard' });
    const unconditional = fields.filter((f) => f.block >= 2 && !f.branching.includes(`[${lastFlagVariable(1)}]='0'`));
    expect(unconditional.map((f) => f.variable)).toEqual([]);
  });

  test('a stale secondary tick of the current activity does not bring its follow-ups back', () => {
    const fields = fieldsFor({ activityDay: 'yesterday', language: 'en', variant: 'standard' });
    const act = field(fields, blockVariable(1, 'primaryActivity'));
    const ctx = optionContext('en');
    const media = act.codes?.find((c) => c.value === ctx.enTranslator.tObject('primary_activities').media_use)?.code;
    const record = {
      [act.variable]: media as string,
      [blockVariable(1, 'activityEndTime')]: '08:00',
      [blockVariable(1, 'otherActivity')]: '1',
      [blockVariable(1, 'secondaryActivity')]: [media as string],
    };
    expect(isShown(field(fields, blockVariable(1, 'secondaryMediaActivity')).branching, record)).toBe(false);
  });
});

test('Hebrew weekdays are coded as the days they name', () => {
  // Pinned by the Hebrew day names themselves, not by ARRAY_ORDER_PERMUTATIONS, which the
  // generator also uses: "yom rishon" is Sunday, "yom shabbat" is Saturday.
  const days = field(fieldsFor({ activityDay: 'yesterday', language: 'he-male', variant: 'standard' }), 'day_of_week');
  const byLabel = new Map((days.codes ?? []).map((c) => [choiceLabel(days, c.code), c.value]));
  expect(byLabel.get('יום ראשון')).toBe('Sunday');
  expect(byLabel.get('יום שני')).toBe('Monday');
  expect(byLabel.get('יום שבת')).toBe('Saturday');
});
