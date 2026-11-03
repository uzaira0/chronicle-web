import { CancelPendingEnrollmentButton } from '@/components/cancel-pending-enrollment-button';
import { Button } from '@/components/ui/button';
import { useTranslator } from '@/i18n';
import type { StudySaveEnrollmentConflict } from '@/lib/study-save';
import { focusStudyField } from './dialog-controls';
import type { StudyValidationProblem } from './types';

export function StudyValidationSummary({
  visible,
  problems,
}: {
  visible: boolean;
  problems: StudyValidationProblem[];
}) {
  const { t } = useTranslator();
  return (
    <>
      {visible && problems.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
          <p className="font-medium">{t('study_form.validation_summary')}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {problems.map((problem) => (
              <li key={problem.fieldId}>
                <button
                  className="underline underline-offset-2"
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    focusStudyField(event.currentTarget.closest('form'), problem.fieldId);
                  }}
                >
                  {problem.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export function StudySaveErrors({
  error,
  enrollmentConflict,
  studyId,
  onParticipantCancelled,
  settingsConflict,
  onReload,
}: {
  error: string | null;
  enrollmentConflict: StudySaveEnrollmentConflict | null;
  studyId: string;
  onParticipantCancelled: (participantId: string) => void;
  settingsConflict: boolean;
  onReload: () => void;
}) {
  const { t } = useTranslator();
  return (
    <>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {settingsConflict && (
        <Button variant="outline" onClick={onReload}>
          {t('writes.reload_discard')}
        </Button>
      )}
      {enrollmentConflict && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm text-destructive" role="alert">
            {enrollmentConflict.message}
          </p>
          <ul className="mt-3 space-y-2">
            {enrollmentConflict.participantIds.map((participantId) => (
              <li key={participantId} className="flex flex-wrap items-center gap-2">
                <span translate="no">{participantId}</span>
                <CancelPendingEnrollmentButton
                  studyId={studyId}
                  participantId={participantId}
                  onCancelled={() => onParticipantCancelled(participantId)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
