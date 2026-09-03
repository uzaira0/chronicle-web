import { CheckCircle2, MessageSquareCode } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isRtlLanguage, LanguageSwitcher, type Translator, useTranslator } from '@/i18n';
import { getMutationRequestState, REQUEST_STATES } from '@/lib/request-state';
import {
  type AppUsageEntry,
  useGetAppUsageSurveyDataQuery,
  useSubmitAppUsageSurveyMutation,
} from '@/state/study-operations-api';

type ParticipantSurveyFormProps = {
  date: string;
  /** Resolved translation-table code (see tud/i18n); defaults to English. */
  participantId: string;
  studyId: string;
};

/** Who used each app — verbatim from upstream methodic-labs daily app-usage survey. */
export const APP_USAGE_USER_OPTIONS = [
  'Parent alone',
  'Child alone',
  'Parent and child together',
  'Other family member',
] as const;

/** "None of the above / don't know" — exclusive; apps tagged with it are dropped on submit. */
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

type SelectionMap = Record<number, string[]>;

function startOfDayIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function endOfDayIso(date: string): string {
  return `${date}T23:59:59.999Z`;
}

/**
 * The app-usage survey: the participant reviews each app they used in the window
 * and indicates who used it. Selecting "I don't know" (the exclusive none option)
 * drops that app from the submission; every other app is echoed back unchanged with
 * its chosen `users`. Faithful to upstream `methodic-labs/chronicle-web`.
 */
export function ParticipantSurveyForm(props: ParticipantSurveyFormProps) {
  const { date, participantId, studyId } = props;
  const t = useTranslator();
  const dir = isRtlLanguage(t.effectiveCode) ? 'rtl' : 'ltr';
  const {
    data: apps,
    isLoading,
    isError,
  } = useGetAppUsageSurveyDataQuery({
    endDate: endOfDayIso(date),
    participantId,
    startDate: startOfDayIso(date),
    studyId,
  });

  const [submit, submitResult] = useSubmitAppUsageSurveyMutation();
  const submitState = getMutationRequestState(submitResult);
  const [selections, setSelections] = useState<SelectionMap>({});

  const toggleOption = useCallback((index: number, option: string, checked: boolean) => {
    setSelections((prev) => {
      const current = prev[index] ?? [];
      if (option === APP_USAGE_NONE_OPTION) {
        return { ...prev, [index]: checked ? [APP_USAGE_NONE_OPTION] : [] };
      }
      const withoutNone = current.filter((value) => value !== APP_USAGE_NONE_OPTION);
      const next = checked ? [...new Set([...withoutNone, option])] : withoutNone.filter((value) => value !== option);
      return { ...prev, [index]: next };
    });
  }, []);

  const entries = apps ?? [];
  const allAnswered = useMemo(
    () => entries.length > 0 && entries.every((_entry, index) => (selections[index]?.length ?? 0) > 0),
    [entries, selections],
  );

  const handleSubmit = useCallback(() => {
    if (!allAnswered) return;
    const payload: AppUsageEntry[] = entries.flatMap((entry, index) => {
      const selected = selections[index] ?? [];
      if (selected.includes(APP_USAGE_NONE_OPTION)) return [];
      return [{ ...entry, users: selected }];
    });
    submit({ data: payload, participantId, studyId })
      .unwrap()
      .catch(() => {
        // RTK Query owns the failure state rendered by this form.
      });
  }, [allAnswered, entries, selections, participantId, studyId, submit]);

  if (isLoading) {
    return (
      <StatusCard
        description={t.t('app_usage_survey.loading_description')}
        dir={dir}
        title={t.t('app_usage_survey.loading_title')}
      />
    );
  }
  if (isError) {
    return (
      <StatusCard
        description={t.t('app_usage_survey.unavailable_description')}
        dir={dir}
        title={t.t('app_usage_survey.unavailable_title')}
      />
    );
  }
  if (submitState === REQUEST_STATES.SUCCESS) {
    return (
      <Card className="max-w-2xl" dir={dir}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            {t.t('app_usage_survey.thank_you_title')}
          </CardTitle>
          <CardDescription>{t.t('app_usage_survey.thank_you_for_participating')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (entries.length === 0) {
    return (
      <StatusCard
        description={t.t('app_usage_survey.nothing_to_review')}
        dir={dir}
        title={t.t('app_usage_survey.nothing_to_review_title')}
      />
    );
  }

  return (
    <Card className="max-w-2xl" dir={dir}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <MessageSquareCode className="h-5 w-5 text-primary" />
            {t.t('app_usage_survey.title')}
          </CardTitle>
          <LanguageSwitcher />
        </div>
        <CardDescription>{t.t('app_usage_survey.daily_instructions')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {entries.map((entry, index) => (
          <AppUsageRow
            index={index}
            key={`${entry.appPackageName}:${entry.timestamp}`}
            onToggle={toggleOption}
            selection={selections[index] ?? []}
            entry={entry}
            translator={t}
          />
        ))}

        {submitState === REQUEST_STATES.FAILURE && (
          <p className="text-sm text-destructive">{t.t('app_usage_survey.error_submit')}</p>
        )}

        <div className="flex justify-end">
          <Button
            disabled={!allAnswered || submitState === REQUEST_STATES.PENDING}
            onClick={handleSubmit}
            type="button"
          >
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
  entry: AppUsageEntry;
  index: number;
  onToggle: (index: number, option: string, checked: boolean) => void;
  selection: string[];
  translator?: Translator;
};

export function AppUsageRow({ entry, index, onToggle, selection, translator }: AppUsageRowProps) {
  const context = useTranslator();
  const t = translator ?? context;
  const label = entry.appLabel || entry.appPackageName;
  const options = [...APP_USAGE_USER_OPTIONS, APP_USAGE_NONE_OPTION];
  return (
    <fieldset className="space-y-3">
      <legend className="flex items-baseline gap-2">
        <Badge variant="outline">{index + 1}</Badge>
        <span className="text-base font-semibold text-foreground">{label}</span>
      </legend>
      <div className="space-y-2">
        {options.map((option) => (
          <label
            className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-foreground"
            key={option}
          >
            <input
              checked={selection.includes(option)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              onChange={(event) => onToggle(index, option, event.currentTarget.checked)}
              type="checkbox"
            />
            <span>{t.t(USER_OPTION_KEYS[option] ?? option)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function StatusCard({ description, dir, title }: { description: string; dir: 'ltr' | 'rtl'; title: string }) {
  return (
    <Card className="max-w-2xl" dir={dir}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareCode className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
