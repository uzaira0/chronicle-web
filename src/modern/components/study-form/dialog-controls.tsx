import { LoaderCircle, Pencil, Plus } from 'lucide-react';
import { type FormEvent, useReducer, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { translateCatalog, useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import type { CollectionModuleId } from '@/lib/study-constants';
import { type StudySaveEnrollmentConflict, StudySaveError } from '@/lib/study-save';
import type { StudyFormMode } from './types';
import type { SubmitOutcome } from './use-study-form-submission';

type Feedback = {
  error: string | null;
  enrollmentConflict: StudySaveEnrollmentConflict | null;
  settingsConflict: boolean;
};
type FeedbackAction =
  | { type: 'reset' }
  | { type: 'clearError' }
  | { type: 'failed'; feedback: Feedback }
  | { type: 'participantCancelled'; participantId: string };
const EMPTY_FEEDBACK: Feedback = { error: null, enrollmentConflict: null, settingsConflict: false };

export function focusStudyField(form: HTMLFormElement | null, fieldName: string) {
  const field = form?.elements.namedItem(fieldName);
  if (field instanceof HTMLElement) field.focus();
}

function feedbackReducer(feedback: Feedback, action: FeedbackAction): Feedback {
  if (action.type === 'reset') return EMPTY_FEEDBACK;
  if (action.type === 'clearError') return { ...feedback, error: null };
  if (action.type === 'failed') return action.feedback;
  const conflict = feedback.enrollmentConflict;
  if (!conflict) return feedback;
  const participantIds = conflict.participantIds.filter((id) => id !== action.participantId);
  return { ...feedback, enrollmentConflict: participantIds.length ? { ...conflict, participantIds } : null };
}

function submissionFailure(error: unknown, fallback: string) {
  if (error instanceof StudySaveError) {
    return {
      error: error.message || null,
      enrollmentConflict:
        error.conflicts.find((conflict): conflict is StudySaveEnrollmentConflict => conflict.type === 'enrollment') ??
        null,
      settingsConflict: error.conflicts.some((conflict) => conflict.type === 'settingsRevision'),
    };
  }
  return { error: getErrorMessage(error, fallback), enrollmentConflict: null, settingsConflict: false };
}

type DialogControlOptions = {
  setOpen: (open: boolean) => void;
  mode: StudyFormMode;
  shouldConfirmDiscard: () => boolean;
  onReset: () => void;
};

export function useStudyDialogControls({ setOpen, mode, shouldConfirmDiscard, onReset }: DialogControlOptions) {
  const { t } = useTranslator();
  const [feedback, dispatchFeedback] = useReducer(feedbackReducer, EMPTY_FEEDBACK);
  const [showDiscardConfirmation, setShowDiscardConfirmation] = useState(false);
  const [showPlayStoreConfirmation, setShowPlayStoreConfirmation] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const reset = () => {
    onReset();
    dispatchFeedback({ type: 'reset' });
    setShowValidationErrors(false);
    setShowDiscardConfirmation(false);
    setShowPlayStoreConfirmation(false);
  };
  const closeDialog = () => {
    reset();
    setOpen(false);
  };
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      reset();
      setOpen(true);
    } else if (shouldConfirmDiscard()) {
      setShowDiscardConfirmation(true);
    } else {
      closeDialog();
    }
  };
  const applySubmitOutcome = (outcome: SubmitOutcome, form: HTMLFormElement | null) => {
    switch (outcome.type) {
      case 'invalid':
        setShowValidationErrors(true);
        dispatchFeedback({ type: 'clearError' });
        focusStudyField(form, outcome.fields[0]?.fieldId ?? '');
        break;
      case 'needsPlayStoreConfirm':
        setShowPlayStoreConfirmation(true);
        break;
      case 'saved':
        closeDialog();
        break;
      case 'failed': {
        const failure = submissionFailure(
          outcome.error,
          t(mode === 'create' ? 'study_form.create_failed' : 'study_form.save_failed'),
        );
        dispatchFeedback({ type: 'failed', feedback: failure });
        break;
      }
      case 'ignored':
        break;
    }
  };
  return {
    feedback,
    resetFeedback: () => dispatchFeedback({ type: 'reset' }),
    applySubmitOutcome,
    onParticipantCancelled: (participantId: string) =>
      dispatchFeedback({ type: 'participantCancelled', participantId }),
    handleOpenChange,
    closeDialog,
    showDiscardConfirmation,
    setShowDiscardConfirmation,
    showPlayStoreConfirmation,
    setShowPlayStoreConfirmation,
    showValidationErrors,
    setShowValidationErrors,
  };
}
export function StudyDialogTrigger({ mode }: { mode: StudyFormMode }) {
  const { t } = useTranslator();
  return (
    <DialogTrigger asChild>
      {mode === 'create' ? (
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('study_form.create_new')}
        </Button>
      ) : (
        <Button id="edit-study-trigger" size="sm" variant="outline">
          <Pencil className="mr-2 h-4 w-4" />
          {t('study_form.edit')}
        </Button>
      )}
    </DialogTrigger>
  );
}

function submitButtonKey(mode: StudyFormMode, isSubmitting: boolean): string {
  if (isSubmitting) {
    return mode === 'create' ? 'study_form.creating' : 'study_form.saving';
  }
  return mode === 'create' ? 'study_form.create' : 'study_form.save_changes';
}

export function StudySaveFooter({
  onCancel,
  canAttemptSave,
  isSubmitting,
  mode,
}: {
  onCancel: () => void;
  canAttemptSave: boolean;
  isSubmitting: boolean;
  mode: StudyFormMode;
}) {
  const { t } = useTranslator();
  // Keep Save visible while the long module list scrolls.
  return (
    <div className="sticky bottom-0 z-10 -mx-6 flex justify-end gap-3 border-t border-border bg-card px-6 pb-6 pt-4">
      <Button disabled={isSubmitting} onClick={onCancel} type="button" variant="ghost">
        {t('common.cancel')}
      </Button>
      <Button disabled={!canAttemptSave} type="submit">
        {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
        {t(submitButtonKey(mode, isSubmitting))}
      </Button>
    </div>
  );
}

export function StudyPlayStoreConfirmation({
  open,
  onOpenChange,
  modules,
  canAttemptSave,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modules: CollectionModuleId[];
  canAttemptSave: boolean;
  onConfirm: (event: FormEvent) => void;
}) {
  const { t } = useTranslator();
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogTitle>{t('study_form.play_store_title')}</DialogTitle>
        <DialogDescription>{t('study_form.play_store_description')}</DialogDescription>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {modules.map((id) => (
            <li key={id}>{translateCatalog(t, 'module', id, id)}</li>
          ))}
        </ul>
        <div className="flex justify-end gap-3 pt-4">
          <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
            {t('common.cancel')}
          </Button>
          <Button disabled={!canAttemptSave} onClick={onConfirm} type="button">
            {t('study_form.play_store_confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function StudyDiscardConfirmation({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslator();
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogTitle>{t('study_form.discard_title')}</DialogTitle>
        <DialogDescription>{t('study_form.discard_description')}</DialogDescription>
        <div className="flex justify-end gap-3 pt-4">
          <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
            {t('study_form.discard_continue')}
          </Button>
          <Button onClick={onDiscard} type="button" variant="destructive">
            {t('study_form.discard_confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
