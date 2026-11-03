import { CheckCircle2, type LucideIcon } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useId, useState } from 'react';
import { ParticipantInstrumentState } from '@/components/participant-instrument-state';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { APP_USAGE_DAY_CONFLICTS, type AppUsageDayConflict } from '@/generated/chronicle-contracts';
import { type Translator, useTranslator } from '@/i18n';
import { getParticipantSubmissionErrorMessage } from '@/lib/errors';
import { formatDisplayDate } from '@/lib/format';
import { getMutationRequestState } from '@/lib/request-state';
import {
  type AppUsageAnswer,
  type AppUsageDayApp,
  type AppUsageDaySurvey,
  useGetAppUsageDaySurveyQuery,
  useSubmitAppUsageSurveyMutation,
} from '@/state/study-operations-api';

export type AppUsageSurveyProps = {
  date: string;
  participantId: string;
  studyId: string;
  /** Called when this form's submission is stored (or its receipt replayed); the survey route may then reopen the day. */
  onCompleted?: () => void;
};

/** The server's reason a survey-day submission must be shown again, if that is why it failed. */
function dayConflict(error: unknown): AppUsageDayConflict | undefined {
  if (!error || typeof error !== 'object' || !('status' in error) || error.status !== 409 || !('data' in error))
    return undefined;
  const code = (error.data as { code?: unknown } | null)?.code;
  return APP_USAGE_DAY_CONFLICTS.find((conflict) => conflict === code);
}

function getAppUsageSubmissionErrorMessage(error: unknown, translate: Translator['t']): string {
  const conflict = dayConflict(error);
  return conflict
    ? translate(`app_usage_survey.conflict.${conflict.toLowerCase()}`)
    : getParticipantSubmissionErrorMessage(error, translate);
}

/** The one submission-failure alert, shared by the answer form and the empty-day confirmation. */
export function AppUsageSubmissionAlert({ error }: { error: unknown }) {
  const { t } = useTranslator();
  return (
    <p className="text-sm text-destructive" role="alert">
      {getAppUsageSubmissionErrorMessage(error, t)}
    </p>
  );
}

/** An app with at least one block still to answer. */
export function isUnanswered(app: AppUsageDayApp): boolean {
  return app.blocks.some((block) => block.users == null);
}

/** One submission: the first submitted answers, the day they answered, and the Idempotency-Key minted for them. */
type AppUsageAttempt = { answers: AppUsageAnswer[]; day: AppUsageDaySurvey | undefined; key: string };

/**
 * One ended survey day, served by the server in the study time zone. A retry resends the attempt (its answers under
 * its key), so a lost response is answered from the server's receipt. The attempt lives in memory only, key and
 * answers together (answers never go to browser storage): a day conflict drops it, a reload or another day loses it,
 * and the refreshed day asks only what is still unanswered. A new attempt cannot store twice: the server refuses
 * answers for blocks it already holds (ALREADY_ANSWERED).
 */
export function useAppUsageSurvey({ date, onCompleted, participantId, studyId }: AppUsageSurveyProps) {
  const query = useGetAppUsageDaySurveyQuery({ date, participantId, studyId });
  const [submitSurvey, result] = useSubmitAppUsageSurveyMutation();
  const [attempt, setAttempt] = useState<AppUsageAttempt>();
  const submit = useCallback(
    (answers: AppUsageAnswer[]) => {
      const pending = attempt ?? { answers, day: query.data, key: crypto.randomUUID() };
      setAttempt(pending);
      submitSurvey({ answers: pending.answers, date, idempotencyKey: pending.key, participantId, studyId })
        .unwrap()
        .then(() => onCompleted?.())
        .catch((error: unknown) => {
          // RTK Query owns the failure state rendered by the form.
          if (dayConflict(error)) setAttempt(undefined);
        });
    },
    [submitSurvey, participantId, studyId, date, query.data, attempt, onCompleted],
  );
  return {
    ...query,
    data: attempt ? attempt.day : query.data,
    hasSubmitted: attempt !== undefined,
    submit,
    submitError: result.error,
    submitState: getMutationRequestState(result),
  };
}

export function AppUsageStatusCard({
  focusHeading = false,
  children,
  description,
  dir,
  title,
  icon: Icon,
}: {
  /** The submit control disappears, so focus its confirmation. */
  focusHeading?: boolean;
  children?: ReactNode;
  description: string;
  dir: 'ltr' | 'rtl';
  title: string;
  icon: LucideIcon;
}) {
  const headingId = useId();
  useEffect(() => {
    if (focusHeading) document.getElementById(headingId)?.focus();
  }, [focusHeading, headingId]);
  return (
    <Card className="max-w-2xl" dir={dir}>
      <CardHeader>
        <CardTitle as="h2" layout="icon" id={headingId} tabIndex={focusHeading ? -1 : undefined}>
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        {children}
      </CardHeader>
    </Card>
  );
}

export function AppUsageSurveyFeedback({
  isLoading,
  isError,
  dir,
  error,
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  dir: 'ltr' | 'rtl';
  error?: unknown;
  onRetry: () => unknown;
}) {
  const { t } = useTranslator();
  if (isLoading || isError)
    return (
      <ParticipantInstrumentState
        isError={isError}
        error={error}
        loadingLabel={t('app_usage_survey.loading_description')}
        onRetry={onRetry}
      />
    );
  return (
    <AppUsageStatusCard
      focusHeading
      description={t('app_usage_survey.thank_you_for_participating')}
      dir={dir}
      icon={CheckCircle2}
      title={t('app_usage_survey.thank_you_title')}
    />
  );
}

export function AppUsageSurveyDate({ date }: { date: string }) {
  // Same locale as the day picker above it, so the page never mixes two languages.
  const { effectiveCode } = useTranslator();
  return (
    <p className="text-base font-semibold">
      <time dateTime={date}>{formatDisplayDate(date, effectiveCode)}</time>
    </p>
  );
}

/** The apps of the day whose every block is answered, shown with their answers and not asked again. */
export function AnsweredApps({ apps, label }: { apps: AppUsageDayApp[]; label: (user: string) => string }) {
  const { t } = useTranslator();
  const answered = apps.filter((app) => !isUnanswered(app));
  if (answered.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">{t('app_usage_survey.already_answered')}</h3>
      <ul className="space-y-1 text-sm">
        {answered.map((app) => {
          const users = [...new Set(app.blocks.flatMap((block) => block.users ?? []))];
          return (
            <li className="min-w-0 break-all" key={app.appPackageName}>
              <span className="font-medium">{app.appLabel || app.appPackageName}</span>
              {': '}
              {users.length > 0 ? users.map(label).join(', ') : t('app_usage_survey.answered_no_one')}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A day with nothing left to ask: confirmed when it listed no apps, else every app has its answer. */
export function AppUsageDayDone({
  day,
  dir,
  failure,
  onConfirm,
  pending,
  label,
}: {
  day: AppUsageDaySurvey;
  dir: 'ltr' | 'rtl';
  /** The failed submission's alert: on an empty day pressing Confirm again resubmits; on an answered day it says why. */
  failure?: ReactNode;
  onConfirm: () => void;
  pending: boolean;
  label: (user: string) => string;
}) {
  const { t } = useTranslator();
  if (day.apps.length === 0 && day.state !== 'ANSWERED')
    return (
      <AppUsageStatusCard
        description={t('app_usage_survey.nothing_to_review_confirm')}
        dir={dir}
        icon={CheckCircle2}
        title={t('app_usage_survey.nothing_to_review_title')}
      >
        <div className="space-y-3 pt-2">
          {failure}
          <Button disabled={pending} onClick={onConfirm} type="button">
            {t('app_usage_survey.confirm_empty_day')}
          </Button>
        </div>
      </AppUsageStatusCard>
    );
  return (
    <AppUsageStatusCard
      description={t('app_usage_survey.answered_description')}
      dir={dir}
      icon={CheckCircle2}
      title={t('app_usage_survey.answered_title')}
    >
      {/* A submission refused because the day was answered elsewhere: the answers shown are not this page's. */}
      {failure}
      <AnsweredApps apps={day.apps} label={label} />
    </AppUsageStatusCard>
  );
}

export function AppUsageAnswerFields({ submitted, children }: { submitted: boolean; children: ReactNode }) {
  const { t } = useTranslator();
  return (
    <fieldset className="min-w-0 space-y-6" disabled={submitted}>
      {submitted && <p className="text-sm text-muted-foreground">{t('app_usage_survey.awaiting_confirmation')}</p>}
      {children}
    </fieldset>
  );
}
