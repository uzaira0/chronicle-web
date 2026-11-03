import { type FormEvent, useImperativeHandle, useState } from 'react';
import { AsyncConfirmDialog } from '@/components/async-confirm-dialog';
import { useTranslator } from '@/i18n';
import { useConfirmLeave } from '@/lib/use-confirm-leave';
import {
  StudyDiscardConfirmation,
  StudyPlayStoreConfirmation,
  StudySaveFooter,
  useStudyDialogControls,
} from './study-form/dialog-controls';
import { StudyFormContents, StudyFormDialogFrame } from './study-form/dialog-frame';
import { StudySaveErrors, StudyValidationSummary } from './study-form/form-feedback';
import { StudyFormEditor } from './study-form/study-fields';
import type { StudyFormDialogProps } from './study-form/types';
import { useStudyFormData } from './study-form/use-study-form-data';
import { useStudyFormSubmission } from './study-form/use-study-form-submission';

export type { StudyFormData } from '@/lib/study-form-model';

export function StudyFormDialog({
  canEdit = true,
  mode,
  study,
  onSubmit,
  createdStudyId,
  ref,
}: StudyFormDialogProps & {
  createdStudyId?: string | undefined;
}) {
  const { t } = useTranslator();
  const [open, setOpen] = useState(false);
  const [reloadPrompt, setReloadPrompt] = useState(false);
  const studyId = study?.id ?? createdStudyId ?? '';
  const data = useStudyFormData({ study, studyId, open });
  const readyToSave = canEdit && data.formInitialized && data.studyReadState === 'ready';
  const controls = useStudyDialogControls({
    setOpen,
    mode,
    shouldConfirmDiscard: () => data.isDirty,
    onReset: () => {
      data.resetInitialization();
      setReloadPrompt(false);
    },
  });
  const submission = useStudyFormSubmission({
    onSubmit: (form, context) => {
      controls.resetFeedback();
      return onSubmit(form, context);
    },
    form: data.form,
    settingsRevision: data.settingsRevision,
    canAttemptSave: readyToSave && !controls.feedback.settingsConflict,
    createdStudyId,
  });
  const submit = async (event: FormEvent, confirmed = false) => {
    event.preventDefault();
    const form = event.currentTarget.closest('form');
    if (confirmed) controls.setShowPlayStoreConfirmation(false);
    controls.applySubmitOutcome(await submission.submit(confirmed), form);
  };
  const canAttemptSave = readyToSave && !submission.isSubmitting && !controls.feedback.settingsConflict;
  const requestOpenChange = (nextOpen: boolean) => {
    if (!submission.isSubmitting && (!nextOpen || canEdit)) controls.handleOpenChange(nextOpen);
  };
  // Opening an open dialog would reset its live draft; the header trigger cannot do that either.
  useImperativeHandle(ref, () => ({ open: () => !open && requestOpenChange(true) }));
  // Edits stay protected until the save commits; the save's own move to the study carries SAVED_EDITS_NAVIGATION.
  useConfirmLeave(open && data.isDirty);
  return (
    <StudyFormDialogFrame
      canEdit={canEdit}
      mode={mode}
      open={open}
      onOpenChange={requestOpenChange}
      confirmations={
        <>
          <AsyncConfirmDialog
            open={reloadPrompt}
            allowed={controls.feedback.settingsConflict}
            title={t('writes.reload_discard')}
            description={t('study_form.discard_description')}
            confirmLabel={t('writes.reload_discard')}
            pendingLabel={t('common.loading')}
            failureMessage={t('common.operation_failed')}
            onClose={() => setReloadPrompt(false)}
            onConfirm={() => {
              data.reloadSettings();
              controls.resetFeedback();
              return Promise.resolve();
            }}
          />
          <StudyPlayStoreConfirmation
            open={controls.showPlayStoreConfirmation}
            onOpenChange={controls.setShowPlayStoreConfirmation}
            modules={submission.unsupportedPlayStoreModules}
            canAttemptSave={canAttemptSave}
            onConfirm={(event) => void submit(event, true)}
          />
          <StudyDiscardConfirmation
            open={controls.showDiscardConfirmation}
            onOpenChange={controls.setShowDiscardConfirmation}
            onDiscard={controls.closeDialog}
          />
        </>
      }
    >
      <StudyFormContents
        readState={data.studyReadState}
        onRetry={() => data.reloadSettings()}
        onSubmit={(event) => void submit(event)}
      >
        <fieldset className="min-w-0 space-y-8" disabled={submission.isSubmitting}>
          <StudyFormEditor
            form={data.form}
            setForm={data.setForm}
            mode={mode}
            showValidationErrors={controls.showValidationErrors}
            contactError={submission.contactError}
          />
        </fieldset>
        <StudyValidationSummary visible={controls.showValidationErrors} problems={submission.validationProblems} />
        <StudySaveErrors
          error={controls.feedback.error}
          enrollmentConflict={controls.feedback.enrollmentConflict}
          studyId={studyId}
          onParticipantCancelled={controls.onParticipantCancelled}
          settingsConflict={controls.feedback.settingsConflict}
          onReload={() => setReloadPrompt(true)}
        />
        <StudySaveFooter
          onCancel={() => controls.handleOpenChange(false)}
          canAttemptSave={canAttemptSave}
          isSubmitting={submission.isSubmitting}
          mode={mode}
        />
      </StudyFormContents>
    </StudyFormDialogFrame>
  );
}
