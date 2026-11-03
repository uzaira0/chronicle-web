import { MessageSquareCode } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import { ParticipantSessionBanner } from '@/components/participant-session-banner';
import { focusAnswer, ResponseRequired } from '@/components/response-required';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isRtlLanguage, LanguageSwitcher, type Translator, useTranslator } from '@/i18n';
import { useUnsavedParticipantAnswers } from '@/lib/participant-access-guard';
import { REQUEST_STATES } from '@/lib/request-state';
import type { AppUsageAnswer, AppUsageDayApp } from '@/state/study-operations-api';
import {
  AnsweredApps,
  AppUsageAnswerFields,
  AppUsageDayDone,
  AppUsageSubmissionAlert,
  AppUsageSurveyDate,
  AppUsageSurveyFeedback,
  type AppUsageSurveyProps,
  isUnanswered,
  useAppUsageSurvey,
} from './app-usage-survey';

/** Who used each app — verbatim from upstream methodic-labs daily app-usage survey. */
export const APP_USAGE_USER_OPTIONS = [
  'Parent alone',
  'Child alone',
  'Parent and child together',
  'Other family member',
] as const;

/** "None of the above / don't know" — exclusive; stored as the app's answer like any other. */
export const APP_USAGE_NONE_OPTION = "I don't know";

// Submitted `users` values stay the canonical English strings above; only the labels are
// translated, so a language switch never changes what the study receives.
const USER_OPTION_KEYS: Record<string, string> = {
  'Parent alone': 'app_usage_survey.user_options.parent_alone',
  'Child alone': 'app_usage_survey.user_options.child_alone',
  'Parent and child together': 'app_usage_survey.user_options.parent_and_child',
  'Other family member': 'app_usage_survey.user_options.other_family_member',
  [APP_USAGE_NONE_OPTION]: 'app_usage_survey.user_options.dont_know',
};

/** Keyed by app package: a refresh can reorder the apps, and an answer must stay with its app. */
type SelectionMap = Record<string, string[]>;

/**
 * The daily app-usage survey, as upstream `methodic-labs/chronicle-web`: one question per app used on the
 * day, asking who used it. Apps already answered (before a late upload added more) are shown, not asked.
 */
export function ParticipantSurveyForm(props: AppUsageSurveyProps) {
  const t = useTranslator();
  const dir = isRtlLanguage(t.effectiveCode) ? 'rtl' : 'ltr';
  const {
    data: day,
    isLoading,
    isError,
    error,
    refetch,
    submit,
    submitError,
    submitState,
    hasSubmitted,
  } = useAppUsageSurvey(props);
  const [selections, setSelections] = useState<SelectionMap>({});
  const [showMissing, setShowMissing] = useState(false);
  const rowId = useId();
  const keepAlive = useUnsavedParticipantAnswers(
    submitState !== REQUEST_STATES.SUCCESS && Object.values(selections).some((selected) => selected.length > 0),
  );

  const toggleOption = useCallback((app: string, option: string, checked: boolean) => {
    setSelections((prev) => {
      const current = prev[app] ?? [];
      if (option === APP_USAGE_NONE_OPTION) {
        return { ...prev, [app]: checked ? [APP_USAGE_NONE_OPTION] : [] };
      }
      const withoutNone = current.filter((value) => value !== APP_USAGE_NONE_OPTION);
      const next = checked ? [...new Set([...withoutNone, option])] : withoutNone.filter((value) => value !== option);
      return { ...prev, [app]: next };
    });
  }, []);

  const asked = useMemo(() => (day?.apps ?? []).filter(isUnanswered), [day]);
  const label = (user: string) => t.t(USER_OPTION_KEYS[user] ?? user);

  // As upstream: the answered apps are submitted and the rest stay asked. The server refuses an empty answer.
  const handleSubmit = useCallback(() => {
    const answers: AppUsageAnswer[] = asked.flatMap((app) => {
      const users = selections[app.appPackageName] ?? [];
      return users.length === 0
        ? []
        : app.blocks
            .filter((block) => block.users == null)
            .map((block) => ({ appPackageName: app.appPackageName, blockStart: block.start, users }));
    });
    if (answers.length === 0) {
      setShowMissing(true);
      focusAnswer(`${rowId}-0`);
      return;
    }
    submit(answers);
  }, [asked, rowId, selections, submit]);

  if (!day || isError || submitState === REQUEST_STATES.SUCCESS) {
    return (
      <AppUsageSurveyFeedback
        dir={dir}
        isError={isError}
        isLoading={isLoading || !day}
        error={error}
        onRetry={refetch}
      />
    );
  }

  const failure = submitState === REQUEST_STATES.FAILURE && <AppUsageSubmissionAlert error={submitError} />;

  if (asked.length === 0) {
    return (
      <AppUsageDayDone
        day={day}
        dir={dir}
        failure={failure}
        label={label}
        onConfirm={() => submit([])}
        pending={submitState === REQUEST_STATES.PENDING}
      />
    );
  }

  return (
    <Card className="max-w-2xl" dir={dir}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle as="h2" layout="icon">
            <MessageSquareCode className="h-5 w-5 text-primary" />
            {t.t('app_usage_survey.title')}
          </CardTitle>
          <LanguageSwitcher />
        </div>
        <AppUsageSurveyDate date={props.date} />
        <CardDescription>{t.t('app_usage_survey.daily_instructions')}</CardDescription>
      </CardHeader>
      <CardContent spacing={6}>
        <ParticipantSessionBanner onRetry={keepAlive.retry} status={keepAlive.status} translate={t.t} />
        <AnsweredApps apps={day.apps} label={label} />
        <AppUsageAnswerFields submitted={hasSubmitted}>
          {asked.map((app, index) => (
            <AppUsageRow
              app={app}
              id={`${rowId}-${index}`}
              index={index}
              invalid={showMissing && (selections[app.appPackageName]?.length ?? 0) === 0}
              key={app.appPackageName}
              onToggle={toggleOption}
              selection={selections[app.appPackageName] ?? []}
              translator={t}
            />
          ))}
        </AppUsageAnswerFields>

        {failure}

        <div className="flex justify-end">
          <Button disabled={submitState === REQUEST_STATES.PENDING} onClick={handleSubmit} type="button">
            {submitState === REQUEST_STATES.PENDING
              ? t.t('app_usage_survey.submitting')
              : t.t('app_usage_survey.submit_survey')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type AppUsageRowProps = {
  app: AppUsageDayApp;
  id?: string;
  index: number;
  invalid?: boolean;
  onToggle: (appPackageName: string, option: string, checked: boolean) => void;
  selection: string[];
  translator?: Translator;
};

export function AppUsageRow({ app, id, index, invalid, onToggle, selection, translator }: AppUsageRowProps) {
  const context = useTranslator();
  const t = translator ?? context;
  const label = app.appLabel || app.appPackageName;
  const options = [...APP_USAGE_USER_OPTIONS, APP_USAGE_NONE_OPTION];
  const errorId = `${id}-error`;
  return (
    // min-w-0 + break-all: a fieldset is min-content wide by default, so an unlabelled package
    // name (one unbreakable word) would push the row past the card on a phone.
    <fieldset
      aria-describedby={invalid ? errorId : undefined}
      aria-invalid={invalid}
      className="min-w-0 space-y-3"
      id={id}
    >
      <legend className="flex items-baseline gap-2">
        <Badge variant="outline">{index + 1}</Badge>
        <span className="min-w-0 break-all text-base font-semibold text-foreground">{label}</span>
      </legend>
      <div className="space-y-2">
        {options.map((option) => (
          <label
            className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-foreground"
            key={option}
          >
            <input
              checked={selection.includes(option)}
              className="h-4 w-4 rounded border-border text-primary focus-visible:ring-primary"
              onChange={(event) => onToggle(app.appPackageName, option, event.currentTarget.checked)}
              type="checkbox"
            />
            <span>{t.t(USER_OPTION_KEYS[option] ?? option)}</span>
          </label>
        ))}
      </div>
      {invalid && <ResponseRequired id={errorId} />}
    </fieldset>
  );
}
