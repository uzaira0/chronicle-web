import { LoaderCircle } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useTranslator } from '@/i18n';
import { StudyDialogTrigger } from './dialog-controls';
import type { StudyFormMode, StudyReadState } from './types';

export function StudyFormContents({
  readState,
  onSubmit,
  onRetry,
  children,
}: {
  readState: StudyReadState;
  onSubmit: (event: FormEvent) => void;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslator();
  if (readState === 'pending')
    return (
      <div role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        {t('study_form.loading_settings')}
      </div>
    );
  if (readState === 'failed')
    return (
      <div
        role="alert"
        className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
      >
        {t('study_form.settings_failed')}
        <Button type="button" onClick={onRetry}>
          {t('common.try_again')}
        </Button>
      </div>
    );
  return (
    <form className="mt-4 space-y-8" noValidate onSubmit={onSubmit}>
      {children}
    </form>
  );
}

export function StudyFormDialogFrame({
  canEdit = true,
  mode,
  open,
  onOpenChange,
  confirmations,
  children,
}: {
  canEdit?: boolean;
  mode: StudyFormMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmations: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslator();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {canEdit && <StudyDialogTrigger mode={mode} />}
      <DialogContent variant="form">
        <DialogTitle>{mode === 'create' ? t('study_form.create') : t('study_form.edit_title')}</DialogTitle>
        <DialogDescription>
          {mode === 'create' ? t('study_form.create_description') : t('study_form.edit_description')}
        </DialogDescription>
        {children}
      </DialogContent>
      {confirmations}
    </Dialog>
  );
}
