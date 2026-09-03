import { FileQuestion } from 'lucide-react';
import { useSearchParams } from 'react-router';

import { ParticipantLandingCard } from '@/components/participant-landing-card';
import { ParticipantQuestionnaireForm } from '@/components/participant-questionnaire-form';
import { useTranslator } from '@/i18n';

export function QuestionnaireRoutePage() {
  const [searchParams] = useSearchParams();
  const { t } = useTranslator();
  const studyId = searchParams.get('studyId') || '';
  const participantId = searchParams.get('participantId') || '';
  const questionnaireId = searchParams.get('questionnaireId') || '';

  if (studyId && participantId && questionnaireId) {
    return (
      <ParticipantQuestionnaireForm participantId={participantId} questionnaireId={questionnaireId} studyId={studyId} />
    );
  }

  return (
    <ParticipantLandingCard
      description={t('questionnaire.landing_description')}
      extraParams={[{ key: 'questionnaireId', label: t('questionnaire.landing_param') }]}
      icon={<FileQuestion className="h-5 w-5 text-primary" />}
      title={t('questionnaire.title')}
    />
  );
}
