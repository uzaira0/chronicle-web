import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { statusLabel, useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { getStatusVariant } from '@/lib/participant-status';
import {
  type Participant,
  type ParticipationStatus,
  useUpdateParticipationStatusMutation,
} from '@/state/study-operations-api';

type ChangeEnrollmentModalProps = {
  onClose: () => void;
  participant: Participant;
  studyId: string;
};

export function ChangeEnrollmentModal({ onClose, participant, studyId }: ChangeEnrollmentModalProps) {
  const [updateStatus, { isLoading }] = useUpdateParticipationStatusMutation();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useTranslator();

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const currentStatus = participant.participationStatus;
  const isEnrolled = currentStatus === 'ENROLLED';
  const targetStatus: ParticipationStatus = isEnrolled ? 'NOT_ENROLLED' : 'ENROLLED';
  const actionLabel = isEnrolled ? t('change_enrollment.pause') : t('change_enrollment.resume');

  const handleToggle = async () => {
    setError(null);
    try {
      await updateStatus({
        participantId: participant.participantId,
        status: targetStatus,
        studyId,
      }).unwrap();
      setSuccess(true);
      timerRef.current = setTimeout(onClose, 1200);
    } catch (err) {
      setError(getErrorMessage(err, t('change_enrollment.update_failed')));
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="w-[min(92vw,28rem)]">
        <DialogTitle>{t('change_enrollment.title')}</DialogTitle>
        <DialogDescription>{t('change_enrollment.description', { id: participant.participantId })}</DialogDescription>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{t('change_enrollment.current_status')}</span>
            <Badge variant={getStatusVariant(currentStatus)}>{statusLabel(t, 'participation', currentStatus)}</Badge>
          </div>

          {success ? (
            <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              {t('change_enrollment.updated', { status: statusLabel(t, 'participation', targetStatus) })}
            </div>
          ) : (
            <>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-3">
                <Button onClick={onClose} variant="ghost">
                  {t('common.cancel')}
                </Button>
                <Button
                  disabled={isLoading}
                  onClick={() => {
                    handleToggle().catch((err) => {
                      setError(getErrorMessage(err, t('change_enrollment.update_failed')));
                    });
                  }}
                >
                  {isLoading && <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />}
                  {actionLabel}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
