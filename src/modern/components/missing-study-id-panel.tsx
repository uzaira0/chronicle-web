import { CircleAlert } from 'lucide-react';

import { StatePanel } from '@/components/state-panel';
import { useTranslator } from '@/i18n';

export function MissingStudyIdPanel({ section }: { section: string }) {
  const { t } = useTranslator();
  return (
    <StatePanel
      description={t('missing_study.description', { section })}
      eyebrow={t('missing_study.eyebrow')}
      icon={<CircleAlert className="h-4 w-4" />}
      title={t('missing_study.title')}
    />
  );
}
