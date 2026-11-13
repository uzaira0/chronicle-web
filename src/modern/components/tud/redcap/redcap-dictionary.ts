// REDCap data dictionary for the Time Use Diary, generated from the same page schema
// (tud-schema.ts), option builders and translation tables the participant form renders.
// Nothing here restates question wording or option lists: every label and choice comes
// from buildPage(). What this file adds is the REDCap shape of the diary:
//
//   * The open-ended activity loop becomes `maxActivities` fixed blocks. Block k is shown
//     only while every earlier block ended before the day's end time. Each block stores a
//     hidden calc flag `aNN_last` (1 once its end time reaches the day end) on its own
//     first page, and block k's branching requires `[aJJ_last]='0'` for every J < k. The
//     flags are evaluated live on the page that holds the end time, so a participant who
//     goes back and ends the day earlier closes every later block, as the form's
//     livePages() walk does.
//   * Each block is two survey pages, as in the form: the activity and its end time, then
//     the follow-up questions for that activity. Follow-ups that depend on the activity
//     are branching logic on the previous page's answer; follow-ups that depend on an
//     answer on the same page (secondary activities, "not English" languages) hide live.
//   * Study variants (Ohio State, Sherbrooke) and today/yesterday are fixed per
//     dictionary, as in a study's settings, not switched inside the survey.
//
// Choice codes are the 1-based position of the ENGLISH canonical value in the English
// option list, identical in every language, so projects in different languages export
// the same codes. `codebook()` maps every code back to the value Chronicle stores.
import { LanguageCodes } from '@/i18n/language-codes';
import { createTranslator } from '@/i18n/translator';
import type { ActivityDay, PageAnswers, PageKind, TudSettings } from '../tud-flow';
import type { OptionContext } from '../tud-options';
import { buildPage, type FieldDef, type PageParams } from '../tud-schema';

export type TudVariant = 'standard' | 'osu' | 'sherbrooke';

export interface RedcapDictionaryOptions {
  /** Effective translation-table code: en, de, es, sv, he-male, he-female. */
  language: string;
  activityDay: ActivityDay;
  variant: TudVariant;
  maxActivities: number;
}

export type RedcapFieldType = 'text' | 'notes' | 'radio' | 'checkbox' | 'calc' | 'descriptive';

export interface RedcapField {
  variable: string;
  sectionHeader: string;
  type: RedcapFieldType;
  label: string;
  /** "1, Label | 2, Label" for radio/checkbox; the formula for calc. */
  choices: string;
  note: string;
  validation: '' | 'time';
  required: boolean;
  branching: string;
  annotation: string;
  /** Chronicle answer code this field stores, '' for structural fields. */
  chronicleCode: string;
  /** Activity block number (1-based), 0 for day-level fields. */
  block: number;
  /** For an "other, specify" text field: the choice field it belongs to. */
  otherOf?: string;
  /** Code -> English canonical value, for choice fields. */
  codes?: Array<{ code: string; value: string }>;
}

export const FORM_NAME = 'time_use_diary';
export const OTHER_CODE = '99';
const OTHER_VALUE = 'Other'; // what the form stores for "Other" with no text (tud-widgets OTHER_VALUE)
const LANGUAGES: readonly string[] = Object.values(LanguageCodes);
// A section header starts a new survey page ("one section per page"). Pages with no title
// of their own in the form get a blank header, which REDCap keeps because it is not empty.
const PAGE_BREAK = '&nbsp;';

const DICTIONARY_HEADER = [
  'Variable / Field Name',
  'Form Name',
  'Section Header',
  'Field Type',
  'Field Label',
  'Choices, Calculations, OR Slider Labels',
  'Field Note',
  'Text Validation Type OR Show Slider Number',
  'Text Validation Min',
  'Text Validation Max',
  'Identifier?',
  'Branching Logic (Show field only if...)',
  'Required Field?',
  'Custom Alignment',
  'Question Number (surveys only)',
  'Matrix Group Name',
  'Matrix Ranking?',
  'Field Annotation',
] as const;

// Chronicle answer code -> REDCap variable stem. Day-level stems are the variable;
// activity stems are prefixed with the block (`a07_`). Every code buildPage can emit must
// be listed: an unknown code throws, so a new schema question cannot be silently dropped.
const DAY_VARIABLES: Readonly<Record<string, string>> = {
  bedTimeBeforeActivityDay: 'bed_time_before',
  bgAudioNight: 'bg_audio_night',
  bgTvNight: 'bg_tv_night',
  dayEndTime: 'day_end',
  dayOfWeek: 'day_of_week',
  dayStartTime: 'day_start',
  nonTypicalDayReason: 'nontyp_day_reason',
  nonTypicalSleepReason: 'nontyp_sleep_reason',
  sleepArrangement: 'sleep_arrangement',
  typicalDay: 'typical_day',
  typicalSleepPattern: 'typical_sleep',
  wakeUpCount: 'wake_count',
  wakeUpTimeAfterActivityDay: 'wake_time_after',
};

const BLOCK_STEMS: Readonly<Record<string, string>> = {
  activityEndTime: 'end',
  adultMedia: 'adult_media',
  bgAudioDay: 'bg_audio',
  bgTvDay: 'bg_tv',
  careGiver: 'caregiver',
  collaborator: 'collab',
  otherActivity: 'other_act',
  primaryActivity: 'act',
  primaryBookLanguage: 'p_book_lang',
  primaryBookLanguageNonEnglish: 'p_book_nonen',
  primaryBookTitle: 'p_book_title',
  primaryBookType: 'p_book_type',
  primaryDeviceType: 'p_device',
  primaryMediaActivity: 'p_media_act',
  primaryMediaAge: 'p_media_age',
  primaryMediaLanguage: 'p_media_lang',
  primaryMediaLanguageNonEnglish: 'p_media_nonen',
  primaryMediaName: 'p_media_name',
  secondaryActivity: 'sec_act',
  secondaryBookTitle: 's_book_title',
  secondaryBookType: 's_book_type',
  secondaryMediaActivity: 's_media_act',
  secondaryMediaAge: 's_media_age',
  secondaryMediaName: 's_media_name',
};

export function dayVariable(code: string): string {
  const variable = DAY_VARIABLES[code];
  if (!variable) throw new Error(`[tud-redcap] TUD code ${code} has no REDCap day-level variable`);
  return variable;
}

export function blockPrefix(block: number): string {
  return `a${String(block).padStart(2, '0')}`;
}

export function blockVariable(block: number, code: string): string {
  const stem = BLOCK_STEMS[code];
  if (!stem) throw new Error(`[tud-redcap] TUD code ${code} has no REDCap activity-block variable`);
  return `${blockPrefix(block)}_${stem}`;
}

export function lastFlagVariable(block: number): string {
  return `${blockPrefix(block)}_last`;
}

export function settingsForVariant(variant: TudVariant): TudSettings {
  return {
    clockFormat: 24,
    clockFormatLocked: false,
    enableOsu: variant === 'osu',
    enableSherbrooke: variant === 'sherbrooke',
  };
}

export function optionContext(language: string): OptionContext {
  return { effectiveCode: language, enTranslator: createTranslator('en'), translator: createTranslator(language) };
}

// English canonical values the branching compares against.
function canonical() {
  const en = createTranslator('en');
  const activities = en.tObject('primary_activities');
  const pick = (key: string): string => {
    const value = activities[key];
    if (!value) throw new Error(`[tud-redcap] primary_activities.${key} missing from the English table`);
    return value;
  };
  return {
    childcare: pick('childcare'),
    media: pick('media_use'),
    napping: pick('napping'),
    no: en.t('no'),
    reading: pick('reading'),
    yes: en.t('yes'),
  };
}

/** REDCap time difference in minutes, signed (b - a). Works on two HH:MM time fields. */
function minutesUntil(a: string, b: string): string {
  return `datediff(${a},${b},"m","ymd",true)`;
}

function and(...terms: string[]): string {
  return terms.filter((t) => t !== '').join(' and ');
}

// Options in REDCap "code, label | code, label" form. A code is the 1-based position of
// the stored (English canonical) value in `universe`: the English list first, then values
// only some languages offer (Hebrew's language list adds English and Russian). Every
// language therefore exports the same code for the same answer.
function choiceList(
  field: FieldDef,
  universe: string[],
  otherLabel: string,
): { choices: string; codes: Array<{ code: string; value: string }> } {
  const codes: Array<{ code: string; value: string }> = [];
  const parts: string[] = [];
  for (const option of field.options ?? []) {
    // A list's own "Other" entry is the same answer as the "Other, specify" choice below.
    if (field.withOther && option.value === OTHER_VALUE) continue;
    const index = universe.indexOf(option.value);
    if (index < 0) throw new Error(`[tud-redcap] ${field.code}: option "${option.value}" has no code`);
    const code = String(index + 1);
    codes.push({ code, value: option.value });
    parts.push(`${code}, ${cleanChoiceLabel(option.label)}`);
  }
  // REDCap shows choices in the order listed; keep the participant's language order.
  if (field.withOther) {
    codes.push({ code: OTHER_CODE, value: OTHER_VALUE });
    parts.push(`${OTHER_CODE}, ${cleanChoiceLabel(otherLabel)}`);
  }
  return { choices: parts.join(' | '), codes };
}

function cleanChoiceLabel(label: string): string {
  // "|" separates choices in a REDCap choice list; no TUD label uses it, but never emit a broken list.
  if (label.includes('|')) throw new Error(`[tud-redcap] choice label contains "|": ${label}`);
  return label;
}

// Code of an English value in a field's English option list (the same rule choiceList uses).
// A field the variant does not have (e.g. the book-language branch outside Ohio State)
// yields a placeholder; its condition is never used because the field is not emitted.
function enCode(enFields: Map<string, FieldDef>, code: string, value: string): string {
  const field = enFields.get(code);
  if (!field) return '?';
  const index = (field.options ?? []).findIndex((o) => o.value === value);
  if (index < 0) throw new Error(`[tud-redcap] ${code}: "${value}" is not an option`);
  return String(index + 1);
}

/** The code REDCap stores for an English canonical value of a choice field. */
export function codeFor(field: RedcapField, value: string): string {
  const match = field.codes?.find((c) => c.value === value);
  if (!match) throw new Error(`[tud-redcap] ${field.variable}: no code for "${value}"`);
  return match.code;
}

// Merge field sequences into one ordered list: a field first seen in a later sequence is
// inserted right after the field that precedes it there. The first sequence's definition
// of a code wins (it carries the piped labels).
function mergeOrdered(sequences: FieldDef[][]): FieldDef[] {
  const out: FieldDef[] = [];
  for (const sequence of sequences) {
    let insertAt = 0;
    for (const field of sequence) {
      const index = out.findIndex((existing) => existing.code === field.code);
      if (index >= 0) {
        insertAt = index + 1;
        continue;
      }
      out.splice(insertAt, 0, field);
      insertAt += 1;
    }
  }
  return out;
}

function addStoredValues(universe: Map<string, string[]>, fields: FieldDef[]) {
  for (const field of fields) {
    const values = universe.get(field.code) ?? [];
    for (const option of field.options ?? []) if (!values.includes(option.value)) values.push(option.value);
    universe.set(field.code, values);
  }
}

interface PageBuild {
  fields: FieldDef[];
  enFields: Map<string, FieldDef>;
  /** field code -> every stored value any language offers, English list first. */
  universe: Map<string, string[]>;
}

class DictionaryBuilder {
  readonly rows: RedcapField[] = [];
  private readonly ctx: OptionContext;
  private readonly enCtx: OptionContext;
  private readonly settings: TudSettings;
  private readonly values = canonical();
  private readonly otherLabel: string;
  private readonly otherSpecify: string;

  private readonly opts: RedcapDictionaryOptions;

  constructor(opts: RedcapDictionaryOptions) {
    this.opts = opts;
    this.ctx = optionContext(opts.language);
    this.enCtx = optionContext('en');
    this.settings = settingsForVariant(opts.variant);
    this.otherLabel = this.ctx.translator.t('common.other');
    this.otherSpecify = this.ctx.translator.t('common.other_specify');
  }

  private params(ctx: OptionContext, extra: Partial<PageParams>): PageParams {
    return {
      activityDay: this.opts.activityDay,
      ctx,
      isFirstActivity: false,
      pageAnswers: {},
      settings: this.settings,
      ...extra,
    };
  }

  // Build one page in the target language and in English (for choice codes). Every
  // sequence is built from the same params, so the field codes line up one to one.
  private page(kind: PageKind, variants: Array<Partial<PageParams>>): PageBuild {
    const fields = mergeOrdered(variants.map((v) => buildPage(kind, this.params(this.ctx, v)).fields));
    const enFields = new Map<string, FieldDef>();
    for (const v of variants) {
      for (const field of buildPage(kind, this.params(this.enCtx, v)).fields) {
        if (!enFields.has(field.code)) enFields.set(field.code, field);
      }
    }
    return { enFields, fields, universe: this.universeFor(kind, variants) };
  }

  // Stored values do not depend on the block, so the first block's walk over all
  // languages serves every block.
  private readonly universes = new Map<PageKind, Map<string, string[]>>();
  private universeFor(kind: PageKind, variants: Array<Partial<PageParams>>): Map<string, string[]> {
    const cached = this.universes.get(kind);
    if (cached) return cached;
    const universe = new Map<string, string[]>();
    for (const language of LANGUAGES) {
      const ctx = language === 'en' ? this.enCtx : optionContext(language);
      for (const v of variants) addStoredValues(universe, buildPage(kind, this.params(ctx, v)).fields);
    }
    this.universes.set(kind, universe);
    return universe;
  }

  private push(
    row: Omit<RedcapField, 'annotation' | 'note' | 'sectionHeader' | 'validation' | 'choices'> & Partial<RedcapField>,
  ) {
    this.rows.push({ annotation: '', choices: '', note: '', sectionHeader: '', validation: '', ...row });
  }

  // One schema field as a REDCap field (plus its "other, specify" text when it has one).
  private addField(
    field: FieldDef,
    universe: string[] | undefined,
    variable: string,
    branching: string,
    block: number,
    sectionHeader = '',
    annotation = '',
  ) {
    if (field.widget === 'time') {
      this.push({
        annotation: [field.defaultTime ? `@DEFAULT='${field.defaultTime}'` : '', annotation].filter(Boolean).join(' '),
        block,
        branching,
        chronicleCode: field.code,
        label: field.title,
        note: field.description ?? '',
        required: field.required,
        sectionHeader,
        type: 'text',
        validation: 'time',
        variable,
      });
      return;
    }
    if (field.widget === 'text') {
      this.push({
        annotation,
        block,
        branching,
        chronicleCode: field.code,
        label: field.title,
        note: field.description ?? '',
        required: field.required,
        sectionHeader,
        type: 'text',
        variable,
      });
      return;
    }
    if (!universe) throw new Error(`[tud-redcap] ${field.code}: no stored values for its choices`);
    const { choices, codes } = choiceList(field, universe, this.otherLabel);
    this.push({
      annotation,
      block,
      branching,
      chronicleCode: field.code,
      choices,
      codes,
      label: field.title,
      note: field.description ?? '',
      required: field.required,
      sectionHeader,
      type: field.widget === 'checkbox' ? 'checkbox' : 'radio',
      variable,
    });
    if (field.withOther) {
      const chosen = field.widget === 'checkbox' ? `[${variable}(${OTHER_CODE})]='1'` : `[${variable}]='${OTHER_CODE}'`;
      this.push({
        block,
        branching: and(branching, chosen),
        chronicleCode: field.code,
        label: this.otherSpecify,
        otherOf: variable,
        required: field.required,
        type: 'text',
        variable: `${variable}_oth`,
      });
    }
  }

  private dayRow(code: string): RedcapField {
    const row = this.rows.find((r) => r.variable === dayVariable(code));
    if (!row) throw new Error(`[tud-redcap] ${code} has not been added yet`);
    return row;
  }

  build(): RedcapField[] {
    const t = this.ctx.translator;
    this.push({
      block: 0,
      branching: '',
      chronicleCode: '',
      // ast-grep-ignore: web-i18n-object-label-ts -- researcher-only REDCap field (hidden or record ID), never shown to participants
      label: 'Record ID (Chronicle participant ID)',
      required: false,
      type: 'text',
      variable: 'record_id',
    });
    this.push({
      block: 0,
      branching: '',
      chronicleCode: '',
      label: t.t('intro_text', { context: this.opts.activityDay }),
      required: false,
      type: 'descriptive',
      variable: 'intro',
    });
    this.addPresurvey();
    this.addDaySpan();
    if (this.opts.activityDay === 'today') this.addNight();
    for (let block = 1; block <= this.opts.maxActivities; block += 1) this.addBlock(block);
    if (this.opts.activityDay === 'yesterday') {
      this.addNight();
      if (this.settings.enableOsu) this.addWakeUp();
    }
    return this.rows;
  }

  private addPresurvey() {
    const page = this.page('presurvey', [{ pageAnswers: { typicalDay: this.values.no } }]);
    page.fields.forEach((field, index) => {
      const branching =
        field.code === 'nonTypicalDayReason'
          ? `[${dayVariable('typicalDay')}]='${codeFor(this.dayRow('typicalDay'), this.values.no)}'`
          : '';
      this.addField(
        field,
        page.universe.get(field.code),
        dayVariable(field.code),
        branching,
        0,
        index === 0 ? PAGE_BREAK : '',
      );
    });
  }

  private addDaySpan() {
    const page = this.page('dayspan', [{}]);
    page.fields.forEach((field, index) => {
      this.addField(
        field,
        page.universe.get(field.code),
        dayVariable(field.code),
        '',
        0,
        index === 0 ? PAGE_BREAK : '',
      );
    });
    const start = `[${dayVariable('dayStartTime')}]`;
    const end = `[${dayVariable('dayEndTime')}]`;
    this.push({
      block: 0,
      branching: and(`${start}<>''`, `${end}<>''`, `${minutesUntil(start, end)}<=0`),
      chronicleCode: '',
      label: this.warning(this.ctx.translator.t('error_invalid_bedtime', { time: start })),
      required: false,
      type: 'descriptive',
      variable: 'day_end_err',
    });
  }

  private addNight() {
    const page = this.page('night', [{ pageAnswers: { typicalSleepPattern: this.values.no } }]);
    const title = buildPage('night', this.params(this.ctx, {})).title;
    page.fields.forEach((field, index) => {
      const branching =
        field.code === 'nonTypicalSleepReason'
          ? `[${dayVariable('typicalSleepPattern')}]='${codeFor(this.dayRow('typicalSleepPattern'), this.values.no)}'`
          : '';
      this.addField(
        field,
        page.universe.get(field.code),
        dayVariable(field.code),
        branching,
        0,
        index === 0 ? title : '',
      );
    });
  }

  private addWakeUp() {
    const page = this.page('wakeup', [{}]);
    page.fields.forEach((field, index) => {
      this.addField(
        field,
        page.universe.get(field.code),
        dayVariable(field.code),
        '',
        0,
        index === 0 ? PAGE_BREAK : '',
      );
    });
  }

  /** Block k is open while every earlier block ended before the day's end time. */
  blockOpen(block: number): string {
    const terms: string[] = [];
    for (let j = 1; j < block; j += 1) terms.push(`[${lastFlagVariable(j)}]='0'`);
    return and(...terms);
  }

  private startOf(block: number): string {
    return block === 1 ? `[${dayVariable('dayStartTime')}]` : `[${blockVariable(block - 1, 'activityEndTime')}]`;
  }

  private warning(text: string): string {
    return `<span style="color:#b00020">${text}</span>`;
  }

  private addBlock(block: number) {
    const open = this.blockOpen(block);
    const act = `[${blockVariable(block, 'primaryActivity')}]`;
    const end = `[${blockVariable(block, 'activityEndTime')}]`;
    const dayEnd = `[${dayVariable('dayEndTime')}]`;
    const start = this.startOf(block);

    // Page 1 of the block: the activity and when it ended.
    const primary = this.page('primary', [
      {
        isFirstActivity: block === 1,
        pageAnswers: { primaryActivity: act },
        prevActivityLabel: block === 1 ? '' : `[${blockVariable(block - 1, 'primaryActivity')}]`,
        startTimeLabel: start,
      },
    ]);
    primary.fields.forEach((field, index) => {
      this.addField(
        field,
        primary.universe.get(field.code),
        blockVariable(block, field.code),
        open,
        block,
        index === 0 ? start : '',
      );
    });
    this.push({
      block,
      branching: and(open, `${start}<>''`, `${end}<>''`, `${minutesUntil(start, end)}<=0`),
      chronicleCode: '',
      label: this.warning(this.ctx.translator.t('error_invalid_end', { time: start })),
      required: false,
      type: 'descriptive',
      variable: `${blockPrefix(block)}_end_err`,
    });
    this.push({
      block,
      branching: and(open, `${end}<>''`, `${minutesUntil(end, dayEnd)}<0`),
      chronicleCode: '',
      label: this.warning(this.ctx.translator.t('error_end_past_bedtime', { time: dayEnd })),
      required: false,
      type: 'descriptive',
      variable: `${blockPrefix(block)}_end_late`,
    });
    // The flag carries the block's own branching, so a closed block's first page holds no
    // shown field and REDCap skips it.
    this.push({
      annotation: '@HIDDEN',
      block,
      branching: open,
      chronicleCode: '',
      choices: `if(${minutesUntil(end, dayEnd)}>0, 0, 1)`,
      // ast-grep-ignore: web-i18n-object-label-ts -- researcher-only REDCap field (hidden or record ID), never shown to participants
      label: `Activity ${block} reached the end of the day (1) or not (0)`,
      required: false,
      type: 'calc',
      variable: lastFlagVariable(block),
    });
    if (block === this.opts.maxActivities) {
      // Every earlier block is open (branching), so this block not reaching the day end
      // means the diary had more activities than the survey holds.
      this.push({
        annotation: '@HIDDEN',
        block: 0,
        branching: open,
        chronicleCode: '',
        choices: `if([${lastFlagVariable(block)}]=0, 1, 0)`,
        // ast-grep-ignore: web-i18n-object-label-ts -- researcher-only REDCap field (hidden or record ID), never shown to participants
        label: 'Diary still open after the last activity block (more activities than this survey holds)',
        required: false,
        type: 'calc',
        variable: 'activities_overflow',
      });
    }

    // Page 2 of the block: the follow-up questions for the activity on page 1.
    const answered = and(open, `${act}<>''`, `${end}<>''`);
    const maximal: PageAnswers = {
      otherActivity: this.values.yes,
      primaryBookLanguageNonEnglish: this.values.yes,
      primaryMediaLanguageNonEnglish: this.values.yes,
      secondaryActivity: [this.values.reading, this.values.media],
    };
    const activities = Object.values(this.enCtx.translator.tObject('primary_activities'));
    const contextual = this.page('contextual', [
      { carriedActivity: act, pageAnswers: maximal },
      ...activities.map((activity) => ({ carriedActivity: activity, pageAnswers: maximal })),
    ]);
    const conditions = this.contextualConditions(block, answered, contextual.enFields);
    const actField = this.rows.find((r) => r.variable === blockVariable(block, 'primaryActivity'));
    if (!actField) throw new Error(`[tud-redcap] block ${block} has no activity field`);
    const hideCurrent = this.hideCurrentActivity(actField);
    const sectionHeader = `${start} – ${end}: ${act}`;
    contextual.fields.forEach((field, index) => {
      const condition = conditions[field.code];
      if (condition === undefined)
        throw new Error(`[tud-redcap] no REDCap branching rule for contextual field ${field.code}`);
      this.addField(
        field,
        contextual.universe.get(field.code),
        blockVariable(block, field.code),
        condition,
        block,
        index === 0 ? sectionHeader : '',
        field.code === 'secondaryActivity' ? hideCurrent : '',
      );
    });
  }

  // The form drops the current activity from the secondary-activity choices. The activity
  // was saved on the previous survey page, so an @IF evaluated at page load can hide it.
  private hideCurrentActivity(actField: RedcapField): string {
    const codes = (actField.codes ?? []).map((c) => c.code);
    return codes.reduceRight(
      (otherwise, code) => `@IF([${actField.variable}]='${code}', @HIDECHOICE='${code}', ${otherwise})`,
      "''",
    );
  }

  private contextualConditions(
    block: number,
    answered: string,
    enFields: Map<string, FieldDef>,
  ): Record<string, string> {
    const actRow = this.rows.find((r) => r.variable === blockVariable(block, 'primaryActivity'));
    if (!actRow) throw new Error(`[tud-redcap] block ${block} has no activity field`);
    const act = `[${actRow.variable}]`;
    const v = this.values;
    const is = (value: string) => `${act}='${codeFor(actRow, value)}'`;
    const isNot = (value: string) => `${act}<>'${codeFor(actRow, value)}'`;
    const yes = enCode(enFields, 'otherActivity', v.yes);
    const other = `[${blockVariable(block, 'otherActivity')}]`;
    const secondaryShown = this.settings.enableSherbrooke ? and(answered, isNot(v.childcare)) : answered;
    const secondaryChosen = and(secondaryShown, `${other}='${yes}'`);
    const secAct = blockVariable(block, 'secondaryActivity');
    // The current activity is hidden from the secondary list; a stale tick of it (the
    // activity changed after going back) must not bring its follow-ups back.
    const secHas = (value: string) =>
      and(`[${secAct}(${enCode(enFields, 'secondaryActivity', value)})]='1'`, isNot(value));
    const reading = and(answered, is(v.reading));
    const media = and(answered, is(v.media));
    return {
      adultMedia: answered,
      bgAudioDay: answered,
      bgTvDay: answered,
      careGiver: answered,
      collaborator: and(answered, isNot(v.childcare), isNot(v.napping)),
      otherActivity: secondaryShown,
      primaryBookLanguage: and(
        reading,
        `[${blockVariable(block, 'primaryBookLanguageNonEnglish')}]='${enCode(enFields, 'primaryBookLanguageNonEnglish', v.yes)}'`,
      ),
      primaryBookLanguageNonEnglish: reading,
      primaryBookTitle: reading,
      primaryBookType: reading,
      primaryDeviceType: media,
      primaryMediaActivity: media,
      primaryMediaAge: media,
      primaryMediaLanguage: and(
        media,
        `[${blockVariable(block, 'primaryMediaLanguageNonEnglish')}]='${enCode(enFields, 'primaryMediaLanguageNonEnglish', v.yes)}'`,
      ),
      primaryMediaLanguageNonEnglish: media,
      primaryMediaName: media,
      secondaryActivity: secondaryChosen,
      secondaryBookTitle: and(secondaryChosen, secHas(v.reading)),
      secondaryBookType: and(secondaryChosen, secHas(v.reading)),
      secondaryMediaActivity: and(secondaryChosen, secHas(v.media)),
      secondaryMediaAge: and(secondaryChosen, secHas(v.media)),
      secondaryMediaName: and(secondaryChosen, secHas(v.media)),
    };
  }
}

export function buildRedcapFields(opts: RedcapDictionaryOptions): RedcapField[] {
  if (!Number.isInteger(opts.maxActivities) || opts.maxActivities < 1 || opts.maxActivities > 99) {
    throw new Error(`[tud-redcap] maxActivities must be 1..99, got ${opts.maxActivities}`);
  }
  return new DictionaryBuilder(opts).build();
}

export function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** The REDCap data dictionary CSV (Project Setup -> Data Dictionary -> Upload). */
export function toDictionaryCsv(fields: RedcapField[]): string {
  const lines = [DICTIONARY_HEADER.map(csvCell).join(',')];
  for (const f of fields) {
    const row = [
      f.variable,
      FORM_NAME,
      f.sectionHeader,
      f.type,
      f.label,
      f.choices,
      f.note,
      f.validation,
      '',
      '',
      '',
      f.branching,
      f.required ? 'y' : '',
      '',
      '',
      '',
      '',
      f.annotation,
    ];
    lines.push(row.map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * variable, code -> the value Chronicle stores, for converting REDCap exports. Pass the
 * dictionaries of every language of one day and variant: they share variables and codes,
 * and some codes (Hebrew's English and Russian) appear in one language only.
 */
export function toCodebookCsv(dictionaries: RedcapField[][]): string {
  const lines = ['variable,chronicle_code,block,choice_code,chronicle_value'];
  const seen = new Set<string>();
  const first = dictionaries[0] ?? [];
  for (const [index, field] of first.entries()) {
    if (!field.chronicleCode) continue;
    if (field.type !== 'radio' && field.type !== 'checkbox') {
      const value = field.otherOf ? '(free text for Other)' : '';
      lines.push([field.variable, field.chronicleCode, String(field.block), '', value].map(csvCell).join(','));
      continue;
    }
    const codes = dictionaries
      .flatMap((fields) => fields[index]?.codes ?? [])
      .filter((c) => !seen.has(`${field.variable}/${c.code}`) && seen.add(`${field.variable}/${c.code}`))
      .sort((a, b) => Number(a.code) - Number(b.code));
    for (const c of codes) {
      lines.push([field.variable, field.chronicleCode, String(field.block), c.code, c.value].map(csvCell).join(','));
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}
