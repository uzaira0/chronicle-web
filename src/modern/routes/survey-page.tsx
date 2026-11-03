import { CalendarCheck, MessageSquareCode } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { AppUsageDayPicker, defaultSurveyDay } from '@/components/app-usage-day-picker';
import { AppUsageStatusCard } from '@/components/app-usage-survey';
import { ParticipantHourlySurveyForm } from '@/components/participant-hourly-survey-form';
import { ParticipantInstrumentState } from '@/components/participant-instrument-state';
import { ParticipantLandingCard } from '@/components/participant-landing-card';
import { ParticipantSurveyForm } from '@/components/participant-survey-form';
import type { AppUsageFrequency } from '@/generated/chronicle-contracts';
import { isRtlLanguage, useTranslator } from '@/i18n';
import { confirmDiscardUnsavedEdits } from '@/lib/use-confirm-leave';
import { useGetAppUsageFrequencyQuery, useGetAppUsageSurveyDaysQuery } from '@/state/study-operations-api';

type SurveyRead = { isError: boolean; error?: unknown; refetch: () => unknown };

/** The survey's failed reads: the first one's error tells the participant why (an ended session, say); retry repeats each. */
function failedReads(reads: readonly SurveyRead[]) {
  const failed = reads.filter((read) => read.isError);
  return {
    isError: failed.length > 0,
    error: failed[0]?.error,
    retry: () => {
      for (const read of failed) void read.refetch();
    },
  };
}

export function SurveyRoutePage() {
  const [searchParams] = useSearchParams();
  const studyId = searchParams.get('studyId') || '';
  const participantId = searchParams.get('participantId') || '';
  // `?lang=` / `?gender=` on the participant link seed the shared LanguageProvider.
  const { t, effectiveCode } = useTranslator();
  const ready = Boolean(studyId && participantId);

  // The study's configured app-usage frequency selects the survey variant (DAILY app-by-app vs
  // HOURLY time-bucketed), matching upstream methodic-labs. RTK retains the resolved instrument
  // for this study during refresh failures.
  const frequencyQuery = useGetAppUsageFrequencyQuery(studyId, { skip: !studyId });
  const frequency = frequencyQuery.currentData;
  // The server owns the survey days: which have ended in the study zone, and which are answered.
  const surveyDays = useGetAppUsageSurveyDaysQuery({ participantId, studyId }, { skip: !ready });
  // The opened day and the instrument it opened with: refreshed days or frequency never replace an unsent answer.
  const [picked, setPicked] = useState<{ date: string; frequency: AppUsageFrequency }>();
  // Each opening of a day mounts a fresh form; reopening the open day retires its finished submission.
  const [opening, setOpening] = useState(0);
  // Openings whose submission the form reported stored; a pending or failed attempt never reports, so it is kept.
  // A set, so a late success for one day never erases another day's completion.
  const [completedOpenings, setCompletedOpenings] = useState<ReadonlySet<string>>(new Set());

  if (!ready) {
    return (
      <ParticipantLandingCard
        description={t('participant_landing.survey_description')}
        icon={<MessageSquareCode className="h-5 w-5 text-primary" />}
        title={t('app_usage_survey.title')}
      />
    );
  }

  const days = surveyDays.currentData?.days;
  if (frequency === undefined || days === undefined) {
    const reads = failedReads([frequencyQuery, surveyDays]);
    return (
      <ParticipantInstrumentState
        isError={reads.isError}
        error={reads.error}
        loadingLabel={t('app_usage_survey.loading_title')}
        onRetry={reads.retry}
      />
    );
  }

  const date = picked?.date ?? defaultSurveyDay(days, searchParams.get('date'));
  // The opened day stays open when an answer refreshes the calendar.
  if (picked === undefined && date) setPicked({ date, frequency: frequency.appUsageFrequency });
  if (!date) {
    return (
      <AppUsageStatusCard
        description={t('app_usage_survey.no_days_yet_description')}
        dir={isRtlLanguage(effectiveCode) ? 'rtl' : 'ltr'}
        icon={CalendarCheck}
        title={t('app_usage_survey.no_days_yet_title')}
      />
    );
  }
  const SURVEY_VARIANTS = {
    DAILY: ParticipantSurveyForm,
    HOURLY: ParticipantHourlySurveyForm,
  } satisfies Record<AppUsageFrequency, typeof ParticipantSurveyForm>;
  // A frequency change reaches the participant with their next opening, through the guard below.
  const SurveyForm = SURVEY_VARIANTS[picked?.frequency ?? frequency.appUsageFrequency];
  const openingKey = `${date}#${opening}`;
  return (
    <div className="space-y-6">
      <AppUsageDayPicker
        days={days}
        // Reopening an incomplete day retires only a completed submission; pending attempts keep their payload/key.
        onSelect={(day) => {
          const reopen =
            day === date &&
            completedOpenings.has(openingKey) &&
            days.some((listed) => listed.date === day && listed.state !== 'ANSWERED');
          if ((reopen || day !== date) && confirmDiscardUnsavedEdits(t)) {
            setPicked({ date: day, frequency: frequency.appUsageFrequency });
            setOpening((count) => count + 1);
          }
        }}
        selected={date}
      />
      <SurveyForm
        date={date}
        key={openingKey}
        onCompleted={() => setCompletedOpenings((done) => new Set(done).add(openingKey))}
        participantId={participantId}
        studyId={studyId}
      />
    </div>
  );
}
