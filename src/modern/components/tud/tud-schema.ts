// Data-driven field model for each TUD page, ported from the upstream
// `src/containers/tud/schemas/*` JSON schemas. buildPage(kind, params) returns the
// ordered, conditionally-resolved field list for a page; the renderer is generic over
// FieldDef. Conditional sub-question chains (typicalDay=No, reading/media followups,
// the *NonEnglish language branches, secondary activities, OSU/Sherbrooke variants)
// live here as plain predicates over the english canonical answer values.
import type { ActivityDay, PageAnswers, PageKind, TudSettings } from './tud-flow';
import {
  activityLabel,
  type OptionContext,
  optionsFromArray,
  optionsFromKeys,
  optionsFromObject,
  type TudOption,
} from './tud-options';

export type Widget = 'radio' | 'checkbox' | 'text' | 'time';

export interface FieldDef {
  code: string;
  widget: Widget;
  title: string;
  description?: string;
  options?: TudOption[];
  required: boolean;
  minItems?: number;
  withOther?: boolean;
  defaultTime?: string;
}

export interface PageParams {
  ctx: OptionContext;
  activityDay: ActivityDay;
  settings: TudSettings;
  pageAnswers: PageAnswers;
  isFirstActivity: boolean;
  carriedActivity?: string; // english canonical activity for a contextual page
  prevActivityLabel?: string; // localized label of the previous activity
  startTimeLabel?: string; // formatted start time for {{time}}
}

export interface PageView {
  title: string;
  /** export bucket: 'DayTime' for daytime activities, 'NightTime' for the night page */
  dataType: 'DayTime' | 'NightTime' | 'Summarized';
  fields: FieldDef[];
}

const SHERBROOKE_BED = (label: string) => label.replace(/Crib\/cot\/bed/g, 'Bed');

function enValues(ctx: OptionContext) {
  const activities = ctx.enTranslator.tObject('primary_activities');
  return {
    childcare: activities.childcare ?? '',
    dontKnow: ctx.enTranslator.t('dont_know'),
    media: activities.media_use ?? '',
    napping: activities.napping ?? '',
    no: ctx.enTranslator.t('no'),
    reading: activities.reading ?? '',
    yes: ctx.enTranslator.t('yes'),
  };
}

function dayVars(ctx: OptionContext, activityDay: ActivityDay) {
  return { activityDay: ctx.translator.t(activityDay), context: activityDay };
}

function timeField(ctx: OptionContext, code: string, titleKey: string, def: string, ctxKey?: string): FieldDef {
  const options = ctxKey ? { context: ctxKey } : {};
  return {
    code,
    defaultTime: def,
    description: ctx.translator.t('default_time'),
    required: true,
    title: ctx.translator.t(titleKey, options),
    widget: 'time',
  };
}

// ---- pre-survey ----------------------------------------------------------------

function preSurveyFields(p: PageParams): FieldDef[] {
  const { ctx } = p;
  const vars = dayVars(ctx, p.activityDay);
  const en = enValues(ctx);
  const choices = ctx.translator.tArray('typical_day_choices', vars);
  const fields: FieldDef[] = [
    {
      code: 'dayOfWeek',
      options: optionsFromArray(ctx, 'weekday_options'),
      required: true,
      title: ctx.translator.t('day_of_week', vars),
      widget: 'radio',
    },
    {
      code: 'typicalDay',
      options: [
        { label: choices[0] ?? en.yes, value: en.yes },
        { label: choices[1] ?? en.no, value: en.no },
      ],
      required: true,
      title: ctx.translator.t('typical_day', { ...vars, day: ctx.translator.t('weekday') }),
      widget: 'radio',
    },
  ];
  if (p.pageAnswers.typicalDay === en.no) {
    fields.push({
      code: 'nonTypicalDayReason',
      description: ctx.translator.t('choose_applicable'),
      minItems: 1,
      options: optionsFromArray(ctx, 'non_typical_day_reasons'),
      required: true,
      title: ctx.translator.t('non_typical_day', vars),
      widget: 'checkbox',
      withOther: true,
    });
  }
  return fields;
}

// ---- day span ------------------------------------------------------------------

function daySpanFields(p: PageParams): FieldDef[] {
  const { ctx } = p;
  if (p.activityDay === 'today') {
    return [
      timeField(ctx, 'bedTimeBeforeActivityDay', 'bed_time_before_activity_day', '19:00'),
      timeField(ctx, 'dayStartTime', 'day_start_time', '07:00', 'today'),
      timeField(ctx, 'dayEndTime', 'day_end_time', '19:00', 'today'),
    ];
  }
  const fields = [
    timeField(ctx, 'dayStartTime', 'day_start_time', '07:00', 'yesterday'),
    timeField(ctx, 'dayEndTime', 'day_end_time', '19:00', 'yesterday'),
  ];
  if (!p.settings.enableOsu) {
    fields.push(timeField(ctx, 'wakeUpTimeAfterActivityDay', 'wake_up_time_after_activity_day', '07:00'));
  }
  return fields;
}

// ---- activity (primary) --------------------------------------------------------

function primaryFields(p: PageParams): FieldDef[] {
  const { ctx } = p;
  const selected = typeof p.pageAnswers.primaryActivity === 'string' ? p.pageAnswers.primaryActivity : undefined;
  const titleVars = { activity: p.prevActivityLabel ?? '', time: p.startTimeLabel ?? '' };
  return [
    {
      code: 'primaryActivity',
      description: ctx.translator.t('scroll_activities'),
      options: optionsFromObject(ctx, 'primary_activities'),
      required: true,
      title: p.isFirstActivity
        ? ctx.translator.t('primary_activity', { time: p.startTimeLabel ?? '' })
        : ctx.translator.t('next_activity', titleVars),
      widget: 'radio',
    },
    {
      code: 'activityEndTime',
      description: ctx.translator.t('default_time'),
      required: true,
      title: selected
        ? ctx.translator.t('activity_end_time', { activity: activityLabel(ctx, selected) })
        : ctx.translator.t('default_end_time'),
      widget: 'time',
    },
  ];
}

// ---- followup clusters ---------------------------------------------------------

function bookFollowup(p: PageParams, prefix: 'primary' | 'secondary'): FieldDef[] {
  const { ctx, settings } = p;
  const fields: FieldDef[] = [
    {
      code: `${prefix}BookType`,
      description: ctx.translator.t('choose_applicable'),
      minItems: 1,
      options: optionsFromArray(ctx, 'book_type_options'),
      required: true,
      title: ctx.translator.t('book_type'),
      widget: 'checkbox',
      withOther: true,
    },
    { code: `${prefix}BookTitle`, required: false, title: ctx.translator.t('book_title'), widget: 'text' },
  ];
  if (prefix === 'primary' && settings.enableOsu) {
    fields.push(languageBranch(p, 'primaryBook', 'book_language_non_english'));
    if (p.pageAnswers.primaryBookLanguageNonEnglish === enValues(ctx).yes) {
      fields.push(languageList(p, 'primaryBookLanguage'));
    }
  }
  return fields;
}

function mediaFollowup(p: PageParams, prefix: 'primary' | 'secondary'): FieldDef[] {
  const { ctx, settings } = p;
  const osu = settings.enableOsu;
  const fields: FieldDef[] = [
    {
      code: `${prefix}MediaActivity`,
      description: ctx.translator.t('choose_applicable'),
      minItems: 1,
      options: optionsFromArray(ctx, 'media_activity_options'),
      required: true,
      title: ctx.translator.t('media_activity'),
      widget: 'checkbox',
      withOther: true,
    },
  ];
  if (!osu) {
    fields.push({
      code: `${prefix}MediaAge`,
      options: optionsFromArray(ctx, 'media_age_options'),
      required: true,
      title: ctx.translator.t('media_age'),
      widget: 'radio',
    });
  }
  fields.push({ code: `${prefix}MediaName`, required: false, title: ctx.translator.t('media_name'), widget: 'text' });
  if (prefix === 'primary' && osu) {
    fields.push({
      code: 'primaryDeviceType',
      minItems: 1,
      options: optionsFromArray(ctx, 'device_type_options'),
      required: true,
      title: ctx.translator.t('device_type'),
      widget: 'checkbox',
    });
    fields.push(languageBranch(p, 'primaryMedia', 'media_language_non_english'));
    if (p.pageAnswers.primaryMediaLanguageNonEnglish === enValues(ctx).yes) {
      fields.push(languageList(p, 'primaryMediaLanguage'));
    }
  }
  return fields;
}

function languageBranch(p: PageParams, prefix: string, titleKey: string): FieldDef {
  const { ctx } = p;
  return {
    code: `${prefix}LanguageNonEnglish`,
    options: optionsFromKeys(ctx, ['yes', 'no']),
    required: true,
    title: ctx.translator.t(titleKey),
    widget: 'radio',
  };
}

function languageList(p: PageParams, code: string): FieldDef {
  const { ctx } = p;
  return {
    code,
    minItems: 1,
    options: optionsFromArray(ctx, 'language_options'),
    required: true,
    title: ctx.translator.t('language'),
    widget: 'checkbox',
    withOther: true,
  };
}

function activityFollowups(p: PageParams, activity: string): FieldDef[] {
  const en = enValues(p.ctx);
  if (activity === en.reading) return bookFollowup(p, 'primary');
  if (activity === en.media) return mediaFollowup(p, 'primary');
  return [];
}

function secondaryBlock(p: PageParams, activityVar: string): FieldDef[] {
  const { ctx } = p;
  const en = enValues(ctx);
  const current = p.carriedActivity;
  const secondaryOptions = optionsFromObject(ctx, 'primary_activities').filter((o) => o.value !== current);
  const fields: FieldDef[] = [
    {
      code: 'otherActivity',
      options: optionsFromKeys(ctx, ['yes', 'no', 'dont_know']),
      required: true,
      title: ctx.translator.t('other_activity', { activity: activityVar }),
      widget: 'radio',
    },
  ];
  if (p.pageAnswers.otherActivity !== en.yes) return fields;
  fields.push({
    code: 'secondaryActivity',
    description: ctx.translator.t('choose_applicable'),
    minItems: 1,
    options: secondaryOptions,
    required: true,
    title: ctx.translator.t('secondary_activity', { activity: activityVar }),
    widget: 'checkbox',
  });
  const chosen = Array.isArray(p.pageAnswers.secondaryActivity) ? (p.pageAnswers.secondaryActivity as string[]) : [];
  if (chosen.includes(en.reading)) fields.push(...bookFollowup(p, 'secondary'));
  if (chosen.includes(en.media)) fields.push(...mediaFollowup(p, 'secondary'));
  return fields;
}

function contextualFields(p: PageParams): FieldDef[] {
  const { ctx, settings } = p;
  const activity = p.carriedActivity ?? '';
  const activityVar = activityLabel(ctx, activity);
  const en = enValues(ctx);
  const fields: FieldDef[] = [];

  const isChildcareOrNap = activity === en.childcare || activity === en.napping;
  if (settings.enableOsu) {
    if (!isChildcareOrNap) {
      fields.push({
        code: 'collaborator',
        options: optionsFromArray(ctx, 'collaborator_options'),
        required: true,
        title: ctx.translator.t('collaborator'),
        widget: 'radio',
      });
    }
  } else {
    fields.push({
      code: 'careGiver',
      minItems: 1,
      options: [
        ...optionsFromArray(ctx, 'caregiver_options'),
        { label: ctx.translator.t('no_one'), value: ctx.enTranslator.t('no_one') },
      ],
      required: true,
      title: ctx.translator.t('caregiver', { activity: activityVar }),
      widget: 'checkbox',
    });
  }

  fields.push(...activityFollowups(p, activity));
  // Sherbrooke skips the secondary block for childcare; otherwise include it.
  if (!(settings.enableSherbrooke && activity === en.childcare)) {
    fields.push(...secondaryBlock(p, activityVar));
  }

  if (!settings.enableOsu) {
    for (const [code, titleKey] of [
      ['bgTvDay', 'bg_tv_day'],
      ['bgAudioDay', 'bg_audio_day'],
      ['adultMedia', 'adult_media'],
    ] as const) {
      fields.push({
        code,
        options: optionsFromArray(ctx, 'bg_media_options'),
        required: true,
        title: ctx.translator.t(titleKey, { activity: activityVar }),
        widget: 'radio',
      });
    }
  }
  return fields;
}

// ---- night & wake-up -----------------------------------------------------------

function nightFields(p: PageParams): FieldDef[] {
  const { ctx, settings } = p;
  const en = enValues(ctx);
  const fields: FieldDef[] = [
    {
      code: 'typicalSleepPattern',
      options: optionsFromKeys(ctx, ['yes', 'no', 'dont_know']),
      required: true,
      title: ctx.translator.t('sleep_pattern'),
      widget: 'radio',
    },
  ];
  if (p.pageAnswers.typicalSleepPattern === en.no) {
    fields.push({
      code: 'nonTypicalSleepReason',
      minItems: 1,
      options: optionsFromArray(ctx, 'non_typical_sleep_options'),
      required: true,
      title: ctx.translator.t('non_typical_sleep_pattern'),
      widget: 'checkbox',
      withOther: true,
    });
  }
  if (!settings.enableOsu) {
    const sleepOptions = optionsFromArray(ctx, 'sleep_arrangement_options').map((o) =>
      settings.enableSherbrooke ? { label: SHERBROOKE_BED(o.label), value: SHERBROOKE_BED(o.value) } : o,
    );
    fields.push({
      code: 'sleepArrangement',
      options: sleepOptions,
      required: true,
      title: ctx.translator.t('sleep_arrangement'),
      widget: 'radio',
      withOther: true,
    });
  }
  fields.push({
    code: 'wakeUpCount',
    options: optionsFromArray(ctx, 'wake_up_count_options'),
    required: true,
    title: ctx.translator.t('wake_up_count'),
    widget: 'radio',
  });
  if (!settings.enableOsu) {
    fields.push({
      code: 'bgTvNight',
      options: optionsFromArray(ctx, 'bg_media_options'),
      required: true,
      title: ctx.translator.t('bg_tv_night'),
      widget: 'radio',
    });
    fields.push({
      code: 'bgAudioNight',
      options: optionsFromArray(ctx, 'bg_media_options'),
      required: true,
      title: ctx.translator.t('bg_audio_night'),
      widget: 'radio',
    });
  }
  return fields;
}

function wakeUpFields(p: PageParams): FieldDef[] {
  return [timeField(p.ctx, 'wakeUpTimeAfterActivityDay', 'wake_up_time_after_activity_day', '07:00')];
}

const TITLE_KEY_BY_KIND: Partial<Record<PageKind, string>> = {
  night: 'nighttime_activity_title',
};

export function buildPage(kind: PageKind, params: PageParams): PageView {
  const title = TITLE_KEY_BY_KIND[kind] ? params.ctx.translator.t(TITLE_KEY_BY_KIND[kind]) : '';
  const dataType = kind === 'night' || kind === 'wakeup' ? 'NightTime' : 'DayTime';
  const builders: Partial<Record<PageKind, (p: PageParams) => FieldDef[]>> = {
    contextual: contextualFields,
    dayspan: daySpanFields,
    night: nightFields,
    presurvey: preSurveyFields,
    primary: primaryFields,
    wakeup: wakeUpFields,
  };
  const build = builders[kind];
  return { dataType, fields: build ? build(params) : [], title };
}
