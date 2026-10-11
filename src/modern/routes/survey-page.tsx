import { MessageSquareCode } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { ParticipantHourlySurveyForm } from '@/components/participant-hourly-survey-form';
import { ParticipantInstrumentState } from '@/components/participant-instrument-state';
import { ParticipantLandingCard } from '@/components/participant-landing-card';
import { ParticipantSurveyForm } from '@/components/participant-survey-form';
import { useTranslator } from '@/i18n';
import { localDay } from '@/lib/format';
import { useGetAppUsageFrequencyQuery } from '@/state/study-operations-api';

export function SurveyRoutePage() {
  const [searchParams] = useSearchParams();
  const studyId = searchParams.get('studyId') || '';
  const participantId = searchParams.get('participantId') || '';
  // Reminder links carry no date; they mean today's usage on the participant's own clock. Fixed
  // at mount: answers stay indexed against this day's apps if the form outlives midnight.
  const [today] = useState(() => localDay(new Date()));
  const date = searchParams.get('date') || (studyId && participantId ? today : '');
  // `?lang=` / `?gender=` on the participant link seed the shared LanguageProvider.
  const { t } = useTranslator();

  // The study's configured app-usage frequency selects the survey variant (DAILY app-by-app vs
  // HOURLY time-bucketed), matching upstream methodic-labs. RTK retains the resolved instrument
  // for this study during refresh failures.
  const {
    currentData: frequency,
    isError,
    refetch,
  } = useGetAppUsageFrequencyQuery(studyId, {
    skip: !studyId,
  });

  const resolved = frequency !== undefined;

  const ready = Boolean(studyId && participantId && date);

  if (ready && !resolved) {
    return (
      <ParticipantInstrumentState
        isError={isError}
        loadingLabel={t('app_usage_survey.loading_title')}
        onRetry={() => refetch()}
      />
    );
  }

  if (ready) {
    return frequency?.appUsageFrequency === 'HOURLY' ? (
      <ParticipantHourlySurveyForm date={date} participantId={participantId} studyId={studyId} />
    ) : (
      <ParticipantSurveyForm date={date} participantId={participantId} studyId={studyId} />
    );
  }

  return (
    <ParticipantLandingCard
      description={t('participant_landing.survey_description')}
      extraParams={[{ key: 'date', label: t('participant_landing.survey_date') }]}
      icon={<MessageSquareCode className="h-5 w-5 text-primary" />}
      title={t('app_usage_survey.title')}
    />
  );
}
