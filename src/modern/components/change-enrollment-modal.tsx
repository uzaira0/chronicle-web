import { LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { ParticipationStatus } from '@/generated/chronicle-contracts';
import { statusLabel, useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { canChangeEnrollment, ENROLLMENT_TRANSITIONS, getStatusVariant } from '@/lib/participant-status';
import { useEditorDismissal } from '@/lib/use-confirm-leave';
import { type Participant, useUpdateParticipationStatusMutation } from '@/state/study-operations-api';

type ChangeEnrollmentModalProps = {
  onClose: () => void;
  participant: Participant;
  studyId: string;
};

function useEnrollmentChange({ onClose, participant, studyId }: ChangeEnrollmentModalProps) {
  const [updateStatus, { isLoading }] = useUpdateParticipationStatusMutation();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ParticipationStatus | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useTranslator();

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const currentStatus = participant.participationStatus;
  const canChange = canChangeEnrollment(participant);
  const transitions = ENROLLMENT_TRANSITIONS[currentStatus];

  const handleChange = async (targetStatus: ParticipationStatus) => {
    if (!canChange) return;
    setError(null);
    try {
      await updateStatus({
        participantId: participant.participantId,
        status: targetStatus,
        statusRevision: participant.statusRevision ?? 0,
        studyId,
      }).unwrap();
      setSuccess(targetStatus);
      timerRef.current = setTimeout(onClose, 1200);
    } catch (err) {
      setError(getErrorMessage(err, t('change_enrollment.update_failed')));
    }
  };

  return {
    currentStatus,
    canChange,
    transitions,
    handleChange,
    error,
    success,
    isLoading,
  };
}

export function ChangeEnrollmentModal(props: ChangeEnrollmentModalProps) {
  const { onClose, participant } = props;
  const { t } = useTranslator();
  const change = useEnrollmentChange(props);
  const dismiss = useEditorDismissal(change.isLoading, onClose);
  const consequenceId = useId();
  const [primary, ...secondary] = change.transitions;
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
      open
    >
      <DialogContent className="w-11/12 max-w-md">
        <DialogTitle>{t('change_enrollment.title')}</DialogTitle>
        <DialogDescription>{t('change_enrollment.description', { id: participant.participantId })}</DialogDescription>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{t('change_enrollment.current_status')}</span>
            <Badge variant={getStatusVariant(change.currentStatus)}>
              {statusLabel(t, 'participation', change.currentStatus)}
            </Badge>
          </div>

          {change.success ? (
            <div className="rounded-lg border border-success/50 bg-success-bg px-4 py-3 text-sm text-success">
              {t('change_enrollment.updated', { status: statusLabel(t, 'participation', change.success) })}
            </div>
          ) : (
            <>
              {change.canChange &&
                change.transitions.map((transition) => (
                  <p
                    className="text-sm text-muted-foreground"
                    id={`${consequenceId}-${transition.target}`}
                    key={transition.target}
                  >
                    {t(transition.consequenceKey, { id: participant.participantId })}
                  </p>
                ))}
              {!change.canChange && (
                <p className="text-sm text-muted-foreground">{t('change_enrollment.unavailable')}</p>
              )}
              {change.error && (
                <p className="text-sm text-destructive" role="alert">
                  {change.error}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-3">
                <Button disabled={change.isLoading} onClick={dismiss} variant="ghost">
                  {t('common.cancel')}
                </Button>
                {change.canChange &&
                  secondary.map((transition) => (
                    <Button
                      aria-describedby={`${consequenceId}-${transition.target}`}
                      disabled={change.isLoading}
                      key={transition.target}
                      onClick={() => {
                        void change.handleChange(transition.target);
                      }}
                      variant="outline"
                    >
                      {t(transition.actionKey)}
                    </Button>
                  ))}
                <Button
                  aria-describedby={change.canChange ? `${consequenceId}-${primary.target}` : undefined}
                  disabled={change.isLoading || !change.canChange}
                  onClick={() => {
                    void change.handleChange(primary.target);
                  }}
                >
                  {change.isLoading && <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />}
                  {t(primary.actionKey)}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
