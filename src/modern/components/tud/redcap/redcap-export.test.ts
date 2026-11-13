import { describe, expect, test } from 'bun:test';

import { type Combo, mulberry32, redcapShown, toRecord, walkDiary } from '@/test/tud-redcap-walk';
import {
  blockVariable,
  buildRedcapFields,
  codeFor,
  csvCell,
  dayVariable,
  lastFlagVariable,
  optionContext,
  type RedcapField,
  toDictionaryCsv,
} from './redcap-dictionary';
import { choiceCodes, parseCsv, pruneExportCsv, pruneRecord } from './redcap-export';
import { evaluateRedcap, type RedcapRecord } from './redcap-logic';

const COMBO: Combo = { activityDay: 'yesterday', language: 'en', variant: 'standard' };
const fields = buildRedcapFields({ ...COMBO, maxActivities: 12 });
const field = (variable: string) => fields.find((f) => f.variable === variable) as RedcapField;
const en = optionContext('en').enTranslator;
const activity = (key: string) => en.tObject('primary_activities')[key] as string;

/** Non-empty answers only: a cleared answer and a never-given one look the same in an export. */
function answers(record: RedcapRecord): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    const text = Array.isArray(v) ? [...v].sort().join(',') : v;
    if (text !== '') out[k] = text;
  }
  return out;
}

function validRecord(seed: number, activities: number, combo = COMBO, dictionary = fields): RedcapRecord {
  const { record } = toRecord(
    walkDiary(mulberry32(seed), combo, activities, optionContext(combo.language)),
    dictionary,
  );
  redcapShown(dictionary, record);
  return record;
}

// What REDCap does when the participant edits one page: values on that page change and its
// calcs recompute; every other stored value stays as it was.
function editPage(record: RedcapRecord, changes: RedcapRecord, recompute: string[]): RedcapRecord {
  const out = { ...record, ...changes };
  for (const variable of recompute) out[variable] = String(evaluateRedcap(field(variable).choices, out));
  return out;
}

describe('TUD REDCap export cleanup', () => {
  test('a diary nobody went back in is left exactly as it was', () => {
    for (const variant of ['standard', 'osu', 'sherbrooke'] as const) {
      for (const activityDay of ['today', 'yesterday'] as const) {
        const combo: Combo = { activityDay, language: 'en', variant };
        const dictionary = buildRedcapFields({ ...combo, maxActivities: 12 });
        const rand = mulberry32(99);
        for (let i = 0; i < 40; i += 1) {
          const record = validRecord(Math.floor(rand() * 1e9), 1 + Math.floor(rand() * 12), combo, dictionary);
          expect(answers(pruneRecord(dictionary, record))).toEqual(answers(record));
        }
      }
    }
  });

  test('ending the day earlier clears every later activity', () => {
    const record = validRecord(5, 6);
    expect(record[blockVariable(5, 'primaryActivity')]).not.toBe('');
    const edited = editPage(
      record,
      { [blockVariable(2, 'activityEndTime')]: record[dayVariable('dayEndTime')] as string },
      [lastFlagVariable(2)],
    );
    const pruned = pruneRecord(fields, edited);
    const later = Object.keys(answers(pruned)).filter((v) => /^a(0[3-9]|1\d)_/.test(v));
    expect(later).toEqual([]);
    expect(pruned[blockVariable(2, 'activityEndTime')]).toBe(record[dayVariable('dayEndTime')] as string);
  });

  test('changing an activity clears the old follow-ups and unticks the new activity as a secondary one', () => {
    const act = field(blockVariable(1, 'primaryActivity'));
    const reading = codeFor(act, activity('reading'));
    const media = codeFor(act, activity('media_use'));
    const sec = blockVariable(1, 'secondaryActivity');
    const before = {
      ...validRecord(3, 2),
      [act.variable]: reading,
      [blockVariable(1, 'primaryBookType')]: ['1'],
      [blockVariable(1, 'primaryBookTitle')]: 'A book',
      [blockVariable(1, 'otherActivity')]: '1',
      [sec]: [media, '3'],
      [blockVariable(1, 'secondaryMediaActivity')]: ['1'],
      [blockVariable(1, 'secondaryMediaAge')]: '1',
      [blockVariable(1, 'secondaryMediaName')]: 'A show',
    };
    // Back on page 1 the participant changes Reading to Screen media.
    const pruned = pruneRecord(fields, { ...before, [act.variable]: media });
    for (const code of [
      'primaryBookType',
      'primaryBookTitle',
      'secondaryMediaActivity',
      'secondaryMediaAge',
      'secondaryMediaName',
    ]) {
      expect([code, answers(pruned)[blockVariable(1, code)]]).toEqual([code, undefined]);
    }
    expect(pruned[sec]).toEqual(['3']);
  });

  test('a raw REDCap export is cleaned column by column, unknown columns untouched', () => {
    const record = validRecord(5, 6);
    const stale = editPage(
      record,
      { [blockVariable(2, 'activityEndTime')]: record[dayVariable('dayEndTime')] as string },
      [lastFlagVariable(2)],
    );
    const inputs = fields.filter((f) => f.type !== 'descriptive');
    const header = inputs.flatMap((f) =>
      f.type === 'checkbox' ? choiceCodes(f.choices).map((c) => `${f.variable}___${c}`) : [f.variable],
    );
    header.push('time_use_diary_complete');
    const row = inputs.flatMap((f) => {
      const value = stale[f.variable];
      if (f.type === 'checkbox')
        return choiceCodes(f.choices).map((c) => (Array.isArray(value) && value.includes(c) ? '1' : '0'));
      return [typeof value === 'string' ? value : ''];
    });
    row.push('2');
    const exportCsv = `${header.map(csvCell).join(',')}\n${row.map(csvCell).join(',')}\n`;

    const { csv, cleared } = pruneExportCsv(toDictionaryCsv(fields), exportCsv);
    const [outHeader, outRow] = parseCsv(csv) as [string[], string[]];
    expect(outHeader).toEqual(header);
    const cell = (name: string) => outRow[outHeader.indexOf(name)];
    expect(cleared).toBeGreaterThan(0);
    expect(cell(blockVariable(4, 'primaryActivity'))).toBe('');
    expect(cell(blockVariable(1, 'primaryActivity'))).toBe(record[blockVariable(1, 'primaryActivity')] as string);
    expect(cell('time_use_diary_complete')).toBe('2');
    const box = inputs.find((f) => f.type === 'checkbox' && f.block === 4) as RedcapField;
    expect(choiceCodes(box.choices).map((c) => cell(`${box.variable}___${c}`))).toEqual(
      choiceCodes(box.choices).map(() => '0'),
    );
  });
});
