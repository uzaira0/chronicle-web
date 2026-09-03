import { CheckCircle2, ClipboardList } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isRtlLanguage, resolveLanguageCode } from '@/i18n/language-codes';
import { LanguageSwitcher } from '@/i18n/language-switcher';
import { createTranslator } from '@/i18n/translator';
import { getMutationRequestState, REQUEST_STATES } from '@/lib/request-state';
import { useSubmitTimeUseDiaryMutation } from '@/state/study-operations-api';
import { advancePage, dayEndMinutes, setAnswer, timeErrors } from './tud-engine';
import {
  type ActivityDay,
  carriedActivity,
  FIELD,
  getFirstActivityPage,
  type PageAnswers,
  pageKind,
  type TudAnswers,
  type TudSettings,
  timeToMinutes,
} from './tud-flow';
import { activityLabel, type OptionContext } from './tud-options';
import { buildLiveSubmission, livePrunedAnswers } from './tud-prune';
import { buildPage, type FieldDef, type PageParams } from './tud-schema';
import { ClockFormatSelect, FieldControl, type FieldValue } from './tud-widgets';

export interface TimeUseDiaryFormProps {
  studyId: string;
  participantId: string;
  activityDate: string; // ISO date
  activityDay: ActivityDay;
  effectiveCode: string; // resolved language table code
  settings: TudSettings;
  familyId?: string | undefined;
  waveId?: string | undefined;
}

function formatTime(value: unknown, is12h: boolean): string {
  const minutes = timeToMinutes(value);
  if (minutes === null) return '';
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const mm = String(m).padStart(2, '0');
  if (!is12h) return `${String(h24).padStart(2, '0')}:${mm}`;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${period}`;
}

function isFieldInvalid(field: FieldDef, value: unknown): boolean {
  if (field.widget === 'checkbox') return !Array.isArray(value) || value.length < (field.minItems ?? 1);
  if (field.widget === 'time') return timeToMinutes(value) === null;
  return typeof value !== 'string' || value.trim() === '';
}

function validatePage(fields: FieldDef[], answers: PageAnswers): Set<string> {
  const invalid = new Set<string>();
  for (const field of fields) {
    if (field.required && isFieldInvalid(field, answers[field.code])) invalid.add(field.code);
  }
  return invalid;
}

export function TimeUseDiaryForm(props: TimeUseDiaryFormProps) {
  const { activityDate, activityDay, participantId, settings, studyId } = props;
  // Language is local state so the participant can switch mid-form. Because answers are
  // stored as english canonical values (labels are display-only), switching is lossless —
  // a superset improvement over upstream, which discarded answers on language change.
  const [effectiveCode, setEffectiveCode] = useState(props.effectiveCode);
  const gender = props.effectiveCode === 'he-female' ? 'female' : 'male';
  const ctx: OptionContext = useMemo(
    () => ({ effectiveCode, enTranslator: createTranslator('en'), translator: createTranslator(effectiveCode) }),
    [effectiveCode],
  );

  const initialClock = settings.clockFormat;
  const [answers, setAnswers] = useState<TudAnswers>({ 0: { clockFormat: initialClock } });
  const [page, setPage] = useState(0);
  const [errors, setErrors] = useState<Set<string>>(new Set());

  const [submit, submitResult] = useSubmitTimeUseDiaryMutation();
  const submitState = getMutationRequestState(submitResult);

  const answerClockFormat = answers[0]?.[FIELD.CLOCK_FORMAT];
  const clockFormat = answerClockFormat === 12 || answerClockFormat === 24 ? answerClockFormat : settings.clockFormat;
  const is12h = clockFormat === 12;
  const kind = pageKind(answers, page, activityDay, settings);

  const paramsFor = useCallback(
    (pageIndex: number, pageAnswers: PageAnswers): PageParams => {
      const firstActivity = getFirstActivityPage(activityDay);
      const prevActivity = carriedActivity(answers, pageIndex);
      const own = pageAnswers[FIELD.PRIMARY_ACTIVITY];
      return {
        activityDay,
        carriedActivity: (typeof own === 'string' ? own : prevActivity) ?? '',
        ctx,
        isFirstActivity: pageIndex === firstActivity,
        pageAnswers,
        prevActivityLabel: activityLabel(ctx, prevActivity),
        settings,
        startTimeLabel: formatTime(pageAnswers[FIELD.ACTIVITY_START_TIME], is12h),
      };
    },
    [activityDay, answers, ctx, is12h, settings],
  );

  const currentAnswers = answers[page] ?? {};
  const view = useMemo(() => buildPage(kind, paramsFor(page, currentAnswers)), [kind, paramsFor, page, currentAnswers]);

  const onChange = useCallback(
    (code: string, value: FieldValue) => {
      setAnswers((prev) => setAnswer(prev, page, code, value));
    },
    [page],
  );

  const setClock = useCallback((format: 12 | 24) => {
    setAnswers((prev) => setAnswer(prev, 0, FIELD.CLOCK_FORMAT, format));
  }, []);

  const goNext = useCallback(() => {
    if (kind !== 'intro') {
      const invalid = new Set([
        ...validatePage(view.fields, currentAnswers),
        ...timeErrors(kind, currentAnswers, dayEndMinutes(answers)),
      ]);
      if (invalid.size > 0) {
        setErrors(invalid);
        return;
      }
    }
    setErrors(new Set());
    const advanced = advancePage(answers, page, activityDay, settings);
    setAnswers(advanced.answers);
    setPage(advanced.page);
  }, [kind, view, currentAnswers, answers, page, activityDay, settings]);

  const goBack = useCallback(() => {
    setErrors(new Set());
    setPage((p) => Math.max(0, p - 1));
  }, []);

  const handleSubmit = useCallback(() => {
    const data = buildLiveSubmission({
      activityDate,
      activityDay,
      answers,
      ctx,
      familyId: props.familyId ?? null,
      settings,
      waveId: props.waveId ?? null,
    });
    submit({ data, participantId, studyId })
      .unwrap()
      .catch(() => {
        // RTK Query owns the failure state rendered by this form.
      });
  }, [submit, answers, activityDay, settings, ctx, activityDate, props.familyId, props.waveId, participantId, studyId]);

  if (submitState === REQUEST_STATES.SUCCESS) {
    return (
      <DiaryCard
        icon={<CheckCircle2 className="h-5 w-5 text-primary" />}
        title={ctx.translator.t('submission_success_title')}
        description={ctx.translator.t('submission_success')}
      />
    );
  }

  return (
    <Card className="max-w-2xl" dir={isRtlLanguage(effectiveCode) ? 'rtl' : 'ltr'}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            {ctx.translator.t('tud_route.title')}
          </CardTitle>
          <LanguageSwitcher
            effectiveCode={effectiveCode}
            onSelect={(base) => setEffectiveCode(resolveLanguageCode(base, gender))}
          />
        </div>
        {view.title && <CardDescription>{view.title}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-6">
        {kind === 'intro' && (
          <IntroStep
            clockFormat={clockFormat}
            ctx={ctx}
            locked={settings.clockFormatLocked}
            onClockFormat={setClock}
            activityDay={activityDay}
          />
        )}
        {kind === 'summary' && (
          <SummaryStep
            answers={livePrunedAnswers(answers, activityDay, settings, ctx)}
            ctx={ctx}
            is12h={is12h}
            onEdit={setPage}
          />
        )}
        {kind !== 'intro' && kind !== 'summary' && (
          <div className="space-y-6">
            {view.fields.map((field) => (
              <FieldControl
                field={field}
                invalid={errors.has(field.code)}
                key={field.code}
                onChange={onChange}
                value={answers[page]?.[field.code] as FieldValue}
              />
            ))}
          </div>
        )}

        {submitState === REQUEST_STATES.FAILURE && (
          <p className="text-sm text-destructive">{ctx.translator.t('error_submit')}</p>
        )}

        <div className="flex justify-between">
          <Button disabled={page === 0} onClick={goBack} type="button" variant="outline">
            {ctx.translator.t('button_back')}
          </Button>
          {kind === 'summary' ? (
            <Button disabled={submitState === REQUEST_STATES.PENDING} onClick={handleSubmit} type="button">
              {ctx.translator.t('button_submit')}
            </Button>
          ) : (
            <Button onClick={goNext} type="button">
              {ctx.translator.t('button_next')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function IntroStep({
  activityDay,
  clockFormat,
  ctx,
  locked,
  onClockFormat,
}: {
  activityDay: ActivityDay;
  clockFormat: 12 | 24;
  ctx: OptionContext;
  locked: boolean;
  onClockFormat: (format: 12 | 24) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground">{ctx.translator.t('intro_text', { context: activityDay })}</p>
      {!locked && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">{ctx.translator.t('choose_format')}</p>
          <ClockFormatSelect
            labels={ctx.translator.tArray('clock_formats')}
            onChange={onClockFormat}
            value={clockFormat}
          />
        </div>
      )}
    </div>
  );
}

export function SummaryStep({
  answers,
  ctx,
  is12h,
  onEdit,
}: {
  answers: TudAnswers;
  ctx: OptionContext;
  is12h: boolean;
  onEdit: (page: number) => void;
}) {
  const rows = Object.keys(answers)
    .map(Number)
    .filter((p) => {
      const pageAnswers = answers[p];
      return (
        typeof pageAnswers?.[FIELD.PRIMARY_ACTIVITY] === 'string' && Boolean(pageAnswers[FIELD.FOLLOWUP_COMPLETED])
      );
    })
    .map((p) => {
      const pa = answers[p] ?? {};
      return {
        activity: activityLabel(ctx, pa[FIELD.PRIMARY_ACTIVITY] as string),
        end: formatTime(pa[FIELD.ACTIVITY_END_TIME], is12h),
        page: p,
        start: formatTime(pa[FIELD.ACTIVITY_START_TIME], is12h),
      };
    });
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground">{ctx.translator.t('summary_title')}</p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm"
            key={row.page}
          >
            <span>
              <span className="font-medium">
                {row.start || '—'}–{row.end || '—'}
              </span>{' '}
              · {row.activity}
            </span>
            <Button onClick={() => onEdit(row.page)} size="sm" type="button" variant="ghost">
              {ctx.translator.t('button_edit')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DiaryCard({ description, icon, title }: { description: string; icon: ReactNode; title: string }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
