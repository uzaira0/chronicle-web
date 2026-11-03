import { useId, useState } from 'react';
import { AsyncConfirmDialog } from '@/components/async-confirm-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslator } from '@/i18n';
import { canChangeEnrollment } from '@/lib/participant-status';
import { type Participant, useSetParticipantProcessingBlockMutation } from '@/state/study-operations-api';

export function ParticipantProcessingDialog({
  participant,
  studyId,
  onClose,
}: {
  participant: Participant;
  studyId: string;
  onClose: () => void;
}) {
  const { t } = useTranslator();
  const id = useId();
  const [reason, setReason] = useState('');
  const [change] = useSetParticipantProcessingBlockMutation();
  const blocked = Boolean(participant.processingBlockedAt);
  const label = t(blocked ? 'participants.unblock_processing' : 'participants.block_processing');
  return (
    <AsyncConfirmDialog
      open
      allowed={canChangeEnrollment(participant)}
      onClose={onClose}
      title={label}
      confirmLabel={label}
      pendingLabel={t('study_form.saving')}
      description={t(blocked ? 'participants.unblock_processing_note' : 'participants.block_processing_note')}
      failureMessage={t('common.operation_failed')}
      disabled={!blocked && !reason.trim()}
      onConfirm={() =>
        change({
          studyId,
          participantId: participant.participantId,
          blocked: !blocked,
          statusRevision: participant.statusRevision ?? 0,
          ...(!blocked && { reason: reason.trim() }),
        }).unwrap()
      }
    >
      {blocked ? (
        <p className="break-words text-sm">{participant.processingBlockReason}</p>
      ) : (
        <>
          <Label htmlFor={id}>{t('participants.processing_block_reason')}</Label>
          <Textarea
            id={id}
            name={id}
            required
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
        </>
      )}
    </AsyncConfirmDialog>
  );
}
