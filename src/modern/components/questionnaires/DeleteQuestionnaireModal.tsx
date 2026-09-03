import { LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useTranslator } from '@/i18n';
import type { RequestState } from '@/lib/request-state';

type DeleteQuestionnaireModalProps = {
  onClose: () => void;
  onDelete: () => void;
  questionnaireTitle: string;
  requestState: RequestState;
};

export function DeleteQuestionnaireModal({
  onClose,
  onDelete,
  questionnaireTitle,
  requestState,
}: DeleteQuestionnaireModalProps) {
  const { t } = useTranslator();
  const requestStateComponents: Record<RequestState, ReactNode> = {
    STANDBY: (
      <p className="text-sm leading-6 text-muted-foreground">
        {t('questionnaire_builder.delete_confirm', { title: questionnaireTitle })}
      </p>
    ),
    FAILURE: <p className="text-sm leading-6 text-destructive">{t('questionnaire_builder.delete_failed')}</p>,
    PENDING: (
      <div className="flex flex-col items-center gap-3 text-center">
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t('questionnaire_builder.deleting')}</p>
      </div>
    ),
    SUCCESS: <p className="text-sm leading-6 text-foreground">{t('questionnaire_builder.deleted')}</p>,
  };

  const showDeleteAction = requestState === 'PENDING' || requestState === 'STANDBY';

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent className="w-[min(92vw,32rem)]">
        <div className="space-y-5">
          <div className="flex items-center gap-3 text-destructive">
            <TriangleAlert className="h-5 w-5" />
            <div>
              <DialogTitle>{t('questionnaire_builder.delete_title')}</DialogTitle>
              <DialogDescription>{t('questionnaire_builder.delete_description')}</DialogDescription>
            </div>
          </div>

          <div className="rounded-3xl border border-border/70 bg-muted/40 px-4 py-4">
            {requestStateComponents[requestState]}
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <Button onClick={onClose} type="button" variant="outline">
              {t('common.close')}
            </Button>
            {showDeleteAction && (
              <Button
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={requestState === 'PENDING'}
                onClick={onDelete}
                type="button"
              >
                {t('common.delete')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
