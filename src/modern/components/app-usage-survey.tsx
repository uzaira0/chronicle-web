import { CheckCircle2, type LucideIcon } from 'lucide-react';
import { useCallback } from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslator } from '@/i18n';
import { getMutationRequestState, REQUEST_STATES, type RequestState } from '@/lib/request-state';
import { useSubmissionKey } from '@/lib/use-submission-key';
import {
  type AppUsageEntry,
  toExportDateTime,
  useGetAppUsageSurveyDataQuery,
  useSubmitAppUsageSurveyMutation,
} from '@/state/study-operations-api';

export type AppUsageSurveyProps = { date: string; participantId: string; studyId: string };

export function useAppUsageSurvey({ date, participantId, studyId }: AppUsageSurveyProps) {
  const query = useGetAppUsageSurveyDataQuery({
    // The participant's own calendar day, not the UTC one.
    endDate: toExportDateTime(date, true),
    participantId,
    startDate: toExportDateTime(date),
    studyId,
  });
  const [submitSurvey, result] = useSubmitAppUsageSurveyMutation();
  const { currentKey, rotateKey } = useSubmissionKey([studyId, participantId, 'APP_USAGE', date]);
  const submit = useCallback(
    (data: AppUsageEntry[]) => {
      submitSurvey({ data, idempotencyKey: currentKey(), participantId, studyId })
        .unwrap()
        .then(rotateKey)
        .catch(() => {
          // RTK Query owns the failure state rendered by the form.
        });
    },
    [submitSurvey, currentKey, rotateKey, participantId, studyId],
  );
  return { ...query, submit, submitState: getMutationRequestState(result) };
}

export function AppUsageStatusCard({
  description,
  dir,
  title,
  icon: Icon,
}: {
  description: string;
  dir: 'ltr' | 'rtl';
  title: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="max-w-2xl" dir={dir}>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function AppUsageSurveyFeedback({
  isLoading,
  isError,
  submitState,
  dir,
  icon,
}: {
  isLoading: boolean;
  isError: boolean;
  submitState: RequestState;
  dir: 'ltr' | 'rtl';
  icon: LucideIcon;
}) {
  const { t } = useTranslator();
  const key = isLoading ? 'loading' : isError ? 'unavailable' : 'thank_you';
  return (
    <AppUsageStatusCard
      description={t(
        key === 'thank_you' ? 'app_usage_survey.thank_you_for_participating' : `app_usage_survey.${key}_description`,
      )}
      dir={dir}
      icon={submitState === REQUEST_STATES.SUCCESS && !isLoading && !isError ? CheckCircle2 : icon}
      title={t(`app_usage_survey.${key}_title`)}
    />
  );
}
