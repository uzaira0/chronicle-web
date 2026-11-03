import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AsyncConfirmDialog } from '@/components/async-confirm-dialog';
import { Button } from '@/components/ui/button';
import { useTranslator } from '@/i18n';
import { type DataDeletionOperation, STUDY_ERASURE_MODE, useEraseDeletionMutation } from '@/state/study-operations-api';

/** Erasure runs only when an owner presses this; a pending request never erases on its own. */
export function EraseDeletionButton({
  operation,
  studyId,
}: {
  operation: Pick<DataDeletionOperation, 'operationId'> & Partial<Pick<DataDeletionOperation, 'mode' | 'erasable'>>;
  studyId: string;
}) {
  const { t } = useTranslator();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [erase] = useEraseDeletionMutation();
  if (!operation.erasable) return null;
  return (
    <>
      <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
        {t('participants.erase_now')}
      </Button>
      <AsyncConfirmDialog
        allowed
        destructive
        open={open}
        onClose={() => setOpen(false)}
        title={t('participants.erase_now')}
        description={t('participants.erase_now_description')}
        confirmLabel={t('participants.erase_now')}
        pendingLabel={t('participants.erasing')}
        failureMessage={t('participants.erase_failed')}
        onConfirm={async () => {
          await erase({ studyId, operationId: operation.operationId }).unwrap();
          // A study erasure removes the study itself, so its pages no longer exist.
          if (operation.mode === STUDY_ERASURE_MODE) await navigate('/studies');
        }}
      />
    </>
  );
}
