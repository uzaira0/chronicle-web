import { LoaderCircle, MessageSquareCode } from 'lucide-react';
import { useSearchParams } from 'react-router';

import { ParticipantHourlySurveyForm } from '@/components/participant-hourly-survey-form';
import { ParticipantLandingCard } from '@/components/participant-landing-card';
import { ParticipantSurveyForm } from '@/components/participant-survey-form';
import { useTranslator } from '@/i18n';
import { useGetAppUsageFrequencyQuery } from '@/state/study-operations-api';

export function SurveyRoutePage() {
  const [searchParams] = useSearchParams();
  const studyId = searchParams.get('studyId') || '';
  const participantId = searchParams.get('participantId') || '';
  const date = searchParams.get('date') || '';
  // `?lang=` / `?gender=` on the participant link seed the shared LanguageProvider.
  const { t } = useTranslator();

  // The study's configured app-usage frequency selects the survey variant (DAILY app-by-app vs
  // HOURLY time-bucketed), matching upstream methodic-labs. On error the query yields undefined and
  // we fall back to the daily survey so a settings hiccup never blocks the participant.
  const { data: frequency, isLoading: frequencyLoading } = useGetAppUsageFrequencyQuery(studyId, {
    skip: !studyId,
  });

  const ready = Boolean(studyId && participantId && date);

  if (ready && frequencyLoading) {
    return (
      <div className="mx-auto flex max-w-2xl items-center gap-2 p-6 text-sm text-muted-foreground">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        {t('app_usage_survey.loading_title')}
      </div>
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
