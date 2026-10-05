import { LoaderCircle, MessageSquareCode } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { ParticipantHourlySurveyForm } from '@/components/participant-hourly-survey-form';
import { StatePanel } from '@/components/state-panel';
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
  // HOURLY time-bucketed), matching upstream methodic-labs. On error the query yields undefined and
  // require a resolved instrument and retain it during refresh failures.
  const { data: fetchedSettings, isSuccess, isError, refetch } = useGetAppUsageFrequencyQuery(studyId, {
    skip: !studyId,
  });

  const verified = useRef<{ studyId: string; data: typeof fetchedSettings } | null>(null);
  if (isSuccess) verified.current = { studyId, data: fetchedSettings };
  const resolved = isSuccess || verified.current?.studyId === studyId;
  const frequency = verified.current?.studyId === studyId ? verified.current.data : fetchedSettings;

  const ready = Boolean(studyId && participantId && date);

  if (ready && !resolved && isError) {
    return (
      <StatePanel
        description={t('common.request_failed')}
        icon={<LoaderCircle className="h-5 w-5" />}
        onRetry={() => refetch()}
        title={t('common.error')}
        titleAs="h2"
        tone="destructive"
      />
    );
  }

  if (ready && !resolved) {
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
