import { CircleAlert, ExternalLink, LoaderCircle, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';

import { MissingStudyIdPanel } from '@/components/missing-study-id-panel';
import { SectionHeader } from '@/components/section-header';
import { StatePanel } from '@/components/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { isPreprocessingGuiAvailable, PREPROCESSING_GUI_PATH, preprocessingGuiUrl } from '@/lib/preprocessing-gui';
import { useGetStudySummaryQuery } from '@/state/study-operations-api';

type GuiAvailability = 'checking' | 'available' | 'unavailable';

export function StudyPreprocessingPage() {
  const { studyId = '' } = useParams<{ studyId: string }>();
  const { t } = useTranslator();
  const { data: study, error: studyError, isError, isLoading } = useGetStudySummaryQuery(studyId, { skip: !studyId });

  const guiUrl = useMemo(() => preprocessingGuiUrl(studyId, study?.title), [study?.title, studyId]);
  const modules = useMemo(() => (study?.modules ? Object.keys(study.modules) : []), [study?.modules]);
  const hasDataCollection = modules.includes('CHRONICLE_DATA_COLLECTION');

  const [guiAvailability, setGuiAvailability] = useState<GuiAvailability>('checking');

  useEffect(() => {
    let cancelled = false;
    setGuiAvailability('checking');
    void isPreprocessingGuiAvailable().then((available) => {
      if (!cancelled) {
        setGuiAvailability(available ? 'available' : 'unavailable');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!studyId) {
    return <MissingStudyIdPanel section={t('preprocessing.section')} />;
  }

  if (isLoading) {
    return (
      <StatePanel
        className="max-w-none"
        description={t('preprocessing.loading_description')}
        eyebrow={t('common.loading')}
        icon={<LoaderCircle className="h-5 w-5 animate-spin" />}
        title={t('preprocessing.loading_title')}
      />
    );
  }

  if (isError) {
    return (
      <StatePanel
        className="max-w-none"
        description={getErrorMessage(studyError, t('preprocessing.load_error_fallback'))}
        eyebrow={t('common.error')}
        icon={<CircleAlert className="h-5 w-5" />}
        title={t('preprocessing.load_error_title')}
        tone="destructive"
      />
    );
  }

  const guiIsAvailable = guiAvailability === 'available';

  return (
    <div className="space-y-6">
      <SectionHeader
        size="compact"
        actions={
          guiIsAvailable ? (
            <Button asChild>
              <a href={guiUrl} rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                {t('preprocessing.open_gui')}
              </a>
            </Button>
          ) : (
            <Button disabled title={t('preprocessing.not_in_deployment')}>
              <ExternalLink className="h-4 w-4" />
              {guiAvailability === 'checking' ? t('preprocessing.checking_gui') : t('preprocessing.gui_unavailable')}
            </Button>
          )
        }
        description={t('preprocessing.description')}
        eyebrow={t('preprocessing.section')}
        icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
        title={t('preprocessing.title', { name: study?.title || studyId })}
      />

      <section className="rounded-lg border border-border bg-card px-5 py-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <Badge variant={hasDataCollection ? 'success' : 'muted'}>
            {hasDataCollection
              ? t('preprocessing.data_collection_enabled')
              : t('preprocessing.data_collection_unavailable')}
          </Badge>
          <Badge variant="outline">{t('preprocessing.badge_gui')}</Badge>
          <Badge variant="outline">{t('preprocessing.badge_local')}</Badge>
          <Badge variant="outline">{t('preprocessing.badge_files')}</Badge>
        </div>
        <div className="mt-4 max-w-3xl space-y-2 text-sm text-muted-foreground">
          {guiAvailability === 'unavailable' ? (
            <p>
              {t('preprocessing.unavailable_before_path')} <span className="font-mono">{PREPROCESSING_GUI_PATH}</span>{' '}
              {t('preprocessing.unavailable_after_path')}
            </p>
          ) : (
            <p>
              {t('preprocessing.served_before_path')} <span className="font-mono">{PREPROCESSING_GUI_PATH}</span>.
            </p>
          )}
          <p>{t('preprocessing.bulk_note')}</p>
        </div>
      </section>
    </div>
  );
}
