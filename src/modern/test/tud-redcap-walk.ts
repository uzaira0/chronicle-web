// Test helpers for the TUD REDCap dictionary parity tests: walk the real participant form
// (pageKind + buildPage + advancePage) with random answers, then turn the answers into the
// REDCap record the same participant would produce, and compute which REDCap fields the
// generated branching logic shows for that record.
import {
  blockVariable,
  dayVariable,
  OTHER_CODE,
  type RedcapField,
  settingsForVariant,
  type TudVariant,
} from '@/components/tud/redcap/redcap-dictionary';
import { evaluateRedcap, isShown, type RedcapRecord } from '@/components/tud/redcap/redcap-logic';
import { advancePage } from '@/components/tud/tud-engine';
import {
  type ActivityDay,
  carriedActivity,
  FIELD,
  getFirstActivityPage,
  type PageAnswers,
  type PageKind,
  pageKind,
  type TudAnswers,
} from '@/components/tud/tud-flow';
import { activityLabel, type OptionContext } from '@/components/tud/tud-options';
import { buildPage, type FieldDef, type PageParams } from '@/components/tud/tud-schema';

export type Combo = { language: string; activityDay: ActivityDay; variant: TudVariant };

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export interface WalkedPage {
  kind: PageKind;
  fields: FieldDef[];
  answers: PageAnswers;
  /** Activity block (1-based) for primary and contextual pages, 0 otherwise. */
  block: number;
}

interface Schedule {
  dayStart: number;
  dayEnd: number;
  ends: number[];
}

/** Activity end times in minutes; the last one is the day end. The day ends by 21:00. */
function schedule(rand: () => number, activities: number): Schedule {
  const dayStart = 300 + 15 * Math.floor(rand() * 17); // 05:00..09:00
  const ends: number[] = [];
  let t = dayStart;
  for (let i = 0; i < activities; i += 1) {
    t += 15 * (1 + Math.floor(rand() * 4));
    ends.push(t);
  }
  return { dayEnd: ends[ends.length - 1] as number, dayStart, ends };
}

const freeText = (rand: () => number) => `free text ${Math.floor(rand() * 100)}`;
const pick = <T>(rand: () => number, xs: T[]): T => xs[Math.floor(rand() * xs.length)] as T;

function fillTime(field: FieldDef, rand: () => number, sched: Schedule): string {
  if (field.code === FIELD.DAY_START_TIME) return hhmm(sched.dayStart);
  if (field.code === FIELD.DAY_END_TIME) return hhmm(sched.dayEnd);
  return hhmm(15 * Math.floor(rand() * 96));
}

function fillRadio(field: FieldDef, rand: () => number): string {
  if (field.withOther && rand() < 0.15) return freeText(rand);
  return pick(rand, field.options ?? []).value;
}

function fillCheckbox(field: FieldDef, rand: () => number): string[] {
  const options = field.options ?? [];
  const chosen = options.filter(() => rand() < 0.35).map((o) => o.value);
  if (field.withOther && rand() < 0.15) chosen.push(freeText(rand));
  return chosen.length > 0 ? chosen : [pick(rand, options).value];
}

function fill(field: FieldDef, rand: () => number, sched: Schedule): unknown {
  if (field.widget === 'time') return fillTime(field, rand, sched);
  if (field.widget === 'text') return rand() < 0.5 ? freeText(rand) : '';
  if (field.widget === 'radio') return fillRadio(field, rand);
  return fillCheckbox(field, rand);
}

const CARRIERS: ReadonlySet<string> = new Set([
  FIELD.ACTIVITY_START_TIME,
  FIELD.ACTIVITY_END_TIME,
  FIELD.PRIMARY_ACTIVITY,
  FIELD.FOLLOWUP_COMPLETED,
]);

/** Answer every question until the page stops growing; drop answers it no longer shows. */
function answerPage(
  build: (pa: PageAnswers) => FieldDef[],
  start: PageAnswers,
  rand: () => number,
  sched: Schedule,
): PageAnswers {
  let current = start;
  for (let round = 0; round < 10; round += 1) {
    const missing = build(current).filter((f) => current[f.code] === undefined);
    if (missing.length === 0) break;
    for (const field of missing) current = { ...current, [field.code]: fill(field, rand, sched) };
  }
  const shown = new Set(build(current).map((f) => f.code));
  return Object.fromEntries(Object.entries(current).filter(([key]) => shown.has(key) || CARRIERS.has(key)));
}

/**
 * Walk the form as a participant does until the summary page. `activities` activity pages
 * are scheduled so the last one ends at the day end. `endBeforeStart` makes the first
 * activity end before the day starts (an invalid answer, for the warning test).
 */
export function walkDiary(
  rand: () => number,
  combo: Combo,
  activities: number,
  ctx: OptionContext,
  opts: { endBeforeStart?: boolean } = {},
): WalkedPage[] {
  const settings = settingsForVariant(combo.variant);
  const day = combo.activityDay;
  const sched = schedule(rand, activities);
  let answers: TudAnswers = { 0: {} };
  let page = 0;
  let block = 0;
  const pages: WalkedPage[] = [];
  for (let guard = 0; guard < 500; guard += 1) {
    ({ answers, page } = advancePage(answers, page, day, settings));
    const kind = pageKind(answers, page, day, settings);
    if (kind === 'summary') return pages;
    const seeded: PageAnswers = { ...answers[page] };
    if (kind === 'primary') {
      block += 1;
      if (block > activities) throw new Error(`the form did not end the day after ${activities} activities`);
      seeded[FIELD.PRIMARY_ACTIVITY] = pick(rand, Object.values(ctx.enTranslator.tObject('primary_activities')));
      const end = opts.endBeforeStart && block === 1 ? sched.dayStart - 15 : (sched.ends[block - 1] as number);
      seeded[FIELD.ACTIVITY_END_TIME] = hhmm(end);
    }
    const build = (pa: PageAnswers) => buildPage(kind, formParams(answers, page, pa, day, combo, ctx)).fields;
    const current = answerPage(build, seeded, rand, sched);
    answers = { ...answers, [page]: current };
    pages.push({
      answers: current,
      block: kind === 'primary' || kind === 'contextual' ? block : 0,
      fields: build(current),
      kind,
    });
  }
  throw new Error('the walk did not reach the summary page');
}

/** The params tud-form.tsx passes to buildPage, with times shown as stored (HH:MM). */
export function formParams(
  answers: TudAnswers,
  page: number,
  pageAnswers: PageAnswers,
  day: ActivityDay,
  combo: Combo,
  ctx: OptionContext,
): PageParams {
  const prevActivity = carriedActivity(answers, page);
  const own = pageAnswers[FIELD.PRIMARY_ACTIVITY];
  const start = pageAnswers[FIELD.ACTIVITY_START_TIME];
  return {
    activityDay: day,
    carriedActivity: (typeof own === 'string' ? own : prevActivity) ?? '',
    ctx,
    isFirstActivity: page === getFirstActivityPage(day),
    pageAnswers,
    prevActivityLabel: activityLabel(ctx, prevActivity),
    settings: settingsForVariant(combo.variant),
    startTimeLabel: typeof start === 'string' ? start : '',
  };
}

// ---- answers -> REDCap record ------------------------------------------------------------

export function variableFor(page: WalkedPage, code: string): string {
  return page.block > 0 ? blockVariable(page.block, code) : dayVariable(code);
}

function knownCode(target: RedcapField, value: unknown): string | undefined {
  return target.codes?.find((c) => c.value === value && c.code !== OTHER_CODE)?.code;
}

export interface RecordBuild {
  record: RedcapRecord;
  /** REDCap variables the form showed (including "other, specify" text when used). */
  expected: Set<string>;
}

function setOther(out: RecordBuild, variable: string, text: string) {
  out.record[`${variable}_oth`] = text;
  out.expected.add(`${variable}_oth`);
}

function storeValue(out: RecordBuild, target: RedcapField, value: unknown) {
  const variable = target.variable;
  if (target.type === 'radio') {
    const code = knownCode(target, value);
    out.record[variable] = code ?? OTHER_CODE;
    if (!code) setOther(out, variable, String(value));
    return;
  }
  if (target.type === 'checkbox') {
    const codes = new Set<string>();
    for (const v of Array.isArray(value) ? (value as unknown[]) : []) {
      const code = knownCode(target, v);
      codes.add(code ?? OTHER_CODE);
      if (!code) setOther(out, variable, String(v));
    }
    out.record[variable] = [...codes];
    return;
  }
  out.record[variable] = typeof value === 'string' ? value : '';
}

export function toRecord(pages: WalkedPage[], fields: RedcapField[]): RecordBuild {
  const byVariable = new Map(fields.map((f) => [f.variable, f]));
  const out: RecordBuild = { expected: new Set(), record: {} };
  for (const page of pages) {
    for (const field of page.fields) {
      const variable = variableFor(page, field.code);
      const target = byVariable.get(variable);
      if (!target) throw new Error(`the form showed ${field.code} (${variable}) but the dictionary has no such field`);
      out.expected.add(variable);
      storeValue(out, target, page.answers[field.code]);
    }
  }
  return out;
}

/** Run every shown calc in dictionary order, then return the input fields REDCap shows. */
export function redcapShown(fields: RedcapField[], record: RedcapRecord): Set<string> {
  for (const f of fields) {
    if (f.type !== 'calc') continue;
    // A calc hidden by branching is not calculated (its page is skipped).
    record[f.variable] = isShown(f.branching, record) ? String(evaluateRedcap(f.choices, record)) : '';
  }
  const inputs = fields.filter((f) => f.type !== 'calc' && f.type !== 'descriptive' && f.variable !== 'record_id');
  return new Set(inputs.filter((f) => isShown(f.branching, record)).map((f) => f.variable));
}

// ---- REDCap text helpers -------------------------------------------------------------------

export function choiceLabel(field: RedcapField, code: string): string {
  for (const part of field.choices.split(' | ')) {
    const comma = part.indexOf(',');
    if (part.slice(0, comma).trim() === code) return part.slice(comma + 1).trim();
  }
  throw new Error(`${field.variable} has no choice ${code}`);
}

/** REDCap piping: a choice field shows its label, any other field its raw value. */
export function pipe(text: string, record: RedcapRecord, byVariable: Map<string, RedcapField>): string {
  return text.replace(/\[([a-z][a-z0-9_]*)\]/g, (_m, name: string) => {
    const field = byVariable.get(name);
    const value = record[name];
    if (typeof value !== 'string') return '';
    return field?.type === 'radio' && value !== '' ? choiceLabel(field, value) : value;
  });
}
