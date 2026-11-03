import type { Ref } from 'react';
import type { CollectionModuleId } from '@/lib/study-constants';
import type { ModuleDraft, StudyFormData } from '@/lib/study-form-model';
import type { StudySummary } from '@/state/study-operations-api';

export type StudyFormDialogProps = {
  canEdit?: boolean;
  mode: StudyFormMode;
  // `settingsRevision` is the settings ETag the form was loaded from (edit mode), so the
  // save sends If-Match for exactly the snapshot on screen. The handler advances it in
  // this context after each committed write, including when a subsequent write fails.
  onSubmit: (
    data: StudyFormData,
    context: { settingsRevision?: string | undefined; createdStudyId?: string },
  ) => Promise<void>;
  study?: StudySummary;
  // Lets another control on the page open this same dialog, so a second editor never exists.
  ref?: Ref<StudyFormDialogHandle>;
};

export type StudyFormDialogHandle = { open: () => void };

export type ModuleDraftChange = (moduleId: CollectionModuleId, draft: ModuleDraft) => void;

export type StudyFieldChange = <K extends keyof StudyFormData>(key: K, value: StudyFormData[K]) => void;
export type StudyValidationProblem = { fieldId: string; message: string };

export type StudyFormMode = 'create' | 'edit';
export type StudyReadState = 'failed' | 'pending' | 'ready';
