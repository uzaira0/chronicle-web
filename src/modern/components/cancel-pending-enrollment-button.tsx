import { useState } from 'react';
import { AsyncConfirmDialog } from '@/components/async-confirm-dialog';
import { Button } from '@/components/ui/button';
import { useTranslator } from '@/i18n';
import { useCancelPendingEnrollmentMutation } from '@/state/study-operations-api';

/** Cancelling revokes the code the device is enrolling with, so it is confirmed first. */
export function CancelPendingEnrollmentButton({
  studyId,
  participantId,
  onCancelled,
}: {
  studyId: string;
  participantId: string;
  onCancelled?: () => void;
}) {
  const { t } = useTranslator();
  const [open, setOpen] = useState(false);
  const [cancel] = useCancelPendingEnrollmentMutation();
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" type="button" variant="outline">
        {t('participants.cancel_pending_enrollment')}
      </Button>
      <AsyncConfirmDialog
        allowed
        destructive
        open={open}
        onClose={() => setOpen(false)}
        title={t('participants.cancel_pending_enrollment')}
        description={t('participants.cancel_pending_description', { participantId })}
        confirmLabel={t('participants.revoke_enrollment_code')}
        pendingLabel={t('participants.revoking_enrollment_code')}
        failureMessage={t('participants.cancel_pending_failed')}
        onConfirm={async () => {
          await cancel({ studyId, participantId }).unwrap();
          onCancelled?.();
        }}
      />
    </>
  );
}
