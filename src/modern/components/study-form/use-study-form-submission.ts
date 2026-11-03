import type { RefObject } from 'react';
import { useRef, useState } from 'react';
import { type Translator, useTranslator } from '@/i18n';
import { collectionNumberValidationProblems } from '@/lib/collection-numbers';
import { isValidEmail } from '@/lib/data-validation';
import { EMPTY_PARTICIPANT_POLICY_FORM, validateParticipantPolicy } from '@/lib/participant-policy';
import { DEFAULT_STUDY_TIME_ZONE, HEALTH_CONNECT_RECORD_TYPES, STUDY_FEATURES } from '@/lib/study-constants';
import {
  healthConnectScopeMissing,
  invalidStudyLimitFields,
  playStoreUnsupportedModules,
} from '@/lib/study-form-helpers';
import { type StudyFormData, studyFieldName } from '@/lib/study-form-model';
import type { StudyFormDialogProps, StudyValidationProblem } from './types';

export type SubmitOutcome =
  | { type: 'ignored' }
  | { type: 'invalid'; fields: StudyValidationProblem[] }
  | { type: 'needsPlayStoreConfirm' }
  | { type: 'saved' }
  | { type: 'failed'; error: unknown };

const LIMIT_FIELD_IDS = { studyDurationDays: 'study-duration', dataRetentionDays: 'data-retention' } as const;

function studyLimitsValidationProblems(form: StudyFormData, t: Translator['t']): StudyValidationProblem[] {
  return invalidStudyLimitFields(form).map((field) => ({
    fieldId: LIMIT_FIELD_IDS[field],
    message: t('study_form.limits_whole_days'),
  }));
}

function timeZoneValidationProblems(form: StudyFormData, t: Translator['t']) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: form.timeZone ?? DEFAULT_STUDY_TIME_ZONE });
    return [];
  } catch {
    return [{ fieldId: 'study-time-zone', message: t('study_form.time_zone_invalid') }];
  }
}

function validateStudyForm(form: StudyFormData, t: Translator['t']) {
  const contactError = form.contact.trim()
    ? isValidEmail(form.contact)
      ? null
      : t('study_form.contact_invalid')
    : t('study_form.contact_required');
  const policyErrors = validateParticipantPolicy(form.participantPolicy ?? EMPTY_PARTICIPANT_POLICY_FORM, t);
  const validationProblems = [
    ...timeZoneValidationProblems(form, t),
    ...(!form.title.trim() ? [{ fieldId: 'study-title', message: t('study_form.title_required') }] : []),
    ...(form.features.length === 0
      ? [{ fieldId: studyFieldName.feature(STUDY_FEATURES[0]?.value ?? ''), message: t('study_form.feature_required') }]
      : []),
    ...(contactError ? [{ fieldId: 'study-contact', message: contactError }] : []),
    ...Object.entries(policyErrors).map(([field, message]) => ({
      fieldId: studyFieldName.policy(field),
      message,
    })),
    ...(healthConnectScopeMissing(form.modules.health_connect)
      ? [
          {
            fieldId: studyFieldName.healthConnect(HEALTH_CONNECT_RECORD_TYPES[0].value),
            message: t('study_form.hc_select_one'),
          },
        ]
      : []),
    ...studyLimitsValidationProblems(form, t),
    ...collectionNumberValidationProblems(form, t),
  ];
  return { contactError, policyErrors, validationProblems };
}

type StudyFormSubmissionOptions = {
  onSubmit: StudyFormDialogProps['onSubmit'];
  form: StudyFormData;
  settingsRevision: RefObject<string | undefined>;
  canAttemptSave: boolean;
  createdStudyId: string | undefined;
};

export function useStudyFormSubmission({
  onSubmit,
  form,
  settingsRevision,
  canAttemptSave,
  createdStudyId,
}: StudyFormSubmissionOptions) {
  const { t } = useTranslator();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionInFlight = useRef(false);
  const { contactError, validationProblems } = validateStudyForm(form, t);
  const unsupportedPlayStoreModules = playStoreUnsupportedModules(form);
  const submit = async (playStoreConfirmed = false): Promise<SubmitOutcome> => {
    if (!canAttemptSave || submissionInFlight.current) return { type: 'ignored' };
    if (validationProblems.length > 0) return { type: 'invalid', fields: validationProblems };
    if (!playStoreConfirmed && unsupportedPlayStoreModules.length > 0) return { type: 'needsPlayStoreConfirm' };
    // Acquire the fence before awaiting: React state cannot stop same-turn double clicks.
    submissionInFlight.current = true;
    setIsSubmitting(true);
    const context: Parameters<StudyFormDialogProps['onSubmit']>[1] = {
      settingsRevision: settingsRevision.current,
      ...(createdStudyId && { createdStudyId }),
    };
    try {
      await onSubmit(form, context);
      return { type: 'saved' };
    } catch (error) {
      return { type: 'failed', error };
    } finally {
      // Earlier writes may have committed before a later step failed. Keep their revision.
      settingsRevision.current = context.settingsRevision;
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  };
  return { submit, isSubmitting, contactError, validationProblems, unsupportedPlayStoreModules };
}
