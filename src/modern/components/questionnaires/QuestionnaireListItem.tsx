import { Download, Eye, Pencil, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslator } from '@/i18n';
import { formatDisplayDate } from '@/lib/format';

type QuestionnaireListItemProps = {
  active: boolean;
  dateCreated: string;
  description?: string;
  onDelete: () => void;
  onDownloadResponses?: () => void;
  onEdit: () => void;
  onPreview: () => void;
  questionCount: number;
  title: string;
};

export function QuestionnaireListItem({
  active,
  dateCreated,
  description = '',
  onDelete,
  onDownloadResponses,
  onEdit,
  onPreview,
  questionCount,
  title,
}: QuestionnaireListItemProps) {
  const { t } = useTranslator();
  return (
    <Card>
      <CardContent className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-foreground">{title || t('questionnaire_builder.untitled')}</h3>
            <Badge variant={active ? 'success' : 'muted'}>{active ? t('common.active') : t('common.inactive')}</Badge>
          </div>

          {description && <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}

          <div className="flex flex-wrap gap-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <span>{t('questionnaire_builder.question_count', { count: String(questionCount) })}</span>
            {dateCreated && (
              <span>{t('questionnaire_builder.created_on', { date: formatDisplayDate(dateCreated) })}</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Button
            aria-label={t('questionnaire_builder.preview_aria')}
            onClick={onPreview}
            type="button"
            variant="outline"
          >
            <Eye className="h-4 w-4" />
            {t('common.preview')}
          </Button>
          {onDownloadResponses && (
            <Button
              aria-label={t('questionnaire_builder.download_responses')}
              onClick={onDownloadResponses}
              type="button"
              variant="outline"
            >
              <Download className="h-4 w-4" />
              {t('questionnaire_builder.responses')}
            </Button>
          )}
          <Button aria-label={t('questionnaire_builder.edit_aria')} onClick={onEdit} type="button" variant="outline">
            <Pencil className="h-4 w-4" />
            {t('common.edit')}
          </Button>
          <Button
            aria-label={t('questionnaire_builder.delete_aria')}
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={onDelete}
            type="button"
            variant="outline"
          >
            <Trash2 className="h-4 w-4" />
            {t('common.delete')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
