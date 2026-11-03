import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import type { StudySettingType } from '@/generated/chronicle-contracts';
import {
  EMPTY_PARTICIPANT_POLICY_FORM,
  type ParticipantPolicyForm,
  participantPolicyToForm,
} from '@/lib/participant-policy';
import { COLLECTION_MODULES, DEFAULT_STUDY_TIME_ZONE, DEFAULT_WITHDRAWAL_MODE } from '@/lib/study-constants';
import { moduleDraftsFromSetting, studyDurationToDays } from '@/lib/study-form-helpers';
import type { StudyFormData } from '@/lib/study-form-model';
import { knownSettingsRevision } from '@/state/settings-revision';
import {
  type DataCollectionSettingSummary,
  type StudyLimits,
  type StudySummary,
  useGetStudyLimitsQuery,
  useGetStudySettingLocksQuery,
  useGetStudySettingsQuery,
  useGetStudySummaryQuery,
} from '@/state/study-operations-api';
import type { ModuleDraftChange, StudyReadState } from './types';

function loadedLimitsOf(limits: StudyLimits | undefined): NonNullable<StudyFormData['loadedLimits']> {
  return {
    studyDurationDays: limits?.studyDuration ? String(studyDurationToDays(limits.studyDuration)) : '',
    dataRetentionDays: limits?.dataRetentionDuration ? String(studyDurationToDays(limits.dataRetentionDuration)) : '',
    ...(limits?.studyDuration && { studyDuration: limits.studyDuration }),
    ...(limits?.dataRetentionDuration && { dataRetentionDuration: limits.dataRetentionDuration }),
    ...(limits?.studyEnds && { studyEnds: limits.studyEnds }),
    ...(limits?.studyDataExpires && { studyDataExpires: limits.studyDataExpires }),
  };
}

function initialWithdrawalAndDiarySettings(study?: StudySummary) {
  const withdrawalMode = study?.settings?.Withdrawal?.mode ?? DEFAULT_WITHDRAWAL_MODE;
  // A new study starts in the researcher's own zone; a stored study without one keeps the server's default.
  const timeZone =
    study?.settings?.TimeUseDiary?.timeZone ??
    (study?.id ? DEFAULT_STUDY_TIME_ZONE : Intl.DateTimeFormat().resolvedOptions().timeZone);
  const appUsageFrequency = study?.settings?.AppUsageSurvey?.appUsageFrequency ?? 'DAILY';
  return {
    appUsageFrequency,
    loadedAppUsageFrequency: study?.id ? appUsageFrequency : undefined,
    withdrawalMode,
    loadedWithdrawalMode: study?.id ? withdrawalMode : undefined,
    timeZone,
    loadedTimeZone: study?.id ? timeZone : undefined,
    loadedTimeUseDiary: study?.settings?.TimeUseDiary,
  };
}

function getInitialFormData(
  study?: StudySummary,
  limits?: StudyLimits,
  dataCollection?: DataCollectionSettingSummary,
  participantPolicy?: unknown,
  loadedSettingLocks?: readonly StudySettingType[],
): StudyFormData {
  // A new study starts with data collection selected. The Data Collection Modules
  // section only renders when this feature is on; without it a new study shows no modules
  // and no hint that a chip above hides them.
  const features = study?.modules ? Object.keys(study.modules) : ['CHRONICLE_DATA_COLLECTION'];
  const loadedLimits = loadedLimitsOf(limits);
  const { dataRetentionDays, studyDurationDays } = loadedLimits;

  return {
    contact: study?.contact || '',
    dataRetentionDays,
    description: study?.description || '',
    features,
    group: study?.group || '',
    loadedLimits,
    loadedModules: dataCollection?.modules,
    loadedParticipantPolicy: participantPolicy,
    loadedSettingLocks,
    modules: moduleDraftsFromSetting(dataCollection),
    ...initialWithdrawalAndDiarySettings(study),
    participantPolicy: participantPolicyToForm(participantPolicy),
    studyDurationDays,
    title: study?.title || '',
    version: study?.version || '',
  };
}

function toggleInArray(values: string[], item: string): string[] {
  return values.includes(item) ? values.filter((v) => v !== item) : [...values, item];
}

function resolveStudyReadState(fetching: readonly boolean[], failed: readonly boolean[]): StudyReadState {
  if (fetching.some(Boolean)) return 'pending';
  return failed.some(Boolean) ? 'failed' : 'ready';
}

export function useStudyFormData({
  study,
  studyId,
  open,
}: {
  study: StudySummary | undefined;
  studyId: string;
  open: boolean;
}) {
  const [formInitialized, setFormInitialized] = useState(false);
  const [refreshRequested, setRefreshRequested] = useState(false);
  // Reads fire once the dialog is open and a study exists. Every open refetches, so the form never starts from
  // another page's cached settings. A created study is read only to load the form (a reopen, or Reload after a
  // conflict); between loads the draft on screen is the researcher's, and a background read must not hide it.
  const skipReads = !open || !studyId || (!study && formInitialized);
  const readOptions = { refetchOnMountOrArgChange: true, skip: skipReads };
  const limitsQuery = useGetStudyLimitsQuery(studyId, readOptions);
  // The researcher edits stored choices; device settings endpoints return the feature-gated projection.
  const studySummaryQuery = useGetStudySummaryQuery(studyId, readOptions);
  const settingsQuery = useGetStudySettingsQuery(studyId, readOptions);
  const locksQuery = useGetStudySettingLocksQuery(studyId, readOptions);
  const [form, setForm] = useState<StudyFormData>(() => getInitialFormData(study));
  const initialForm = useRef<StudyFormData>(getInitialFormData(study));

  const initializedForOpen = useRef(false);
  const settingsRevision = useRef<string | undefined>(undefined);
  const loadedStudy = study ?? studySummaryQuery.data;
  const studyReadState = resolveStudyReadState(
    [
      refreshRequested,
      limitsQuery.isFetching,
      studySummaryQuery.isFetching,
      settingsQuery.isFetching,
      locksQuery.isFetching,
    ],
    [limitsQuery.isError, studySummaryQuery.isError, settingsQuery.isError, locksQuery.isError],
  );

  const refetchSettings = useCallback(
    () =>
      Promise.all([limitsQuery.refetch(), studySummaryQuery.refetch(), settingsQuery.refetch(), locksQuery.refetch()]),
    [limitsQuery.refetch, studySummaryQuery.refetch, settingsQuery.refetch, locksQuery.refetch],
  );
  useEffect(() => {
    if (!refreshRequested || skipReads) return;
    let current = true;
    // The query hooks have subscribed above. Wait for fresh results before initializing from their cache.
    void refetchSettings().then(() => {
      if (current) setRefreshRequested(false);
    });
    return () => {
      current = false;
    };
  }, [refreshRequested, skipReads, refetchSettings]);

  useEffect(() => {
    if (!open || studyReadState !== 'ready' || initializedForOpen.current) return;
    const initial = getInitialFormData(
      loadedStudy && { ...loadedStudy, settings: { ...loadedStudy.settings, ...settingsQuery.data } },
      limitsQuery.data,
      studySummaryQuery.data?.settings?.DataCollection,
      settingsQuery.data?.ParticipantPolicy,
      locksQuery.data,
    );
    initialForm.current = initial;
    setForm(initial);
    // The reads above just settled, so the last settings ETag seen is the one this form shows.
    settingsRevision.current = studySummaryQuery.data?.settingsRevision ?? knownSettingsRevision(studyId);
    initializedForOpen.current = true;
    setFormInitialized(true);
  }, [
    open,
    studyReadState,
    loadedStudy,
    studyId,
    limitsQuery.data,
    studySummaryQuery.data,
    settingsQuery.data,
    locksQuery.data,
  ]);

  const resetInitialization = () => {
    initializedForOpen.current = false;
    setFormInitialized(false);
    setRefreshRequested(!study && !!studyId);
  };
  const reloadSettings = () => {
    resetInitialization();
    // A skipped read has never started, so there is nothing to refetch: the reset above starts it.
    if (skipReads) return;
    void refetchSettings();
  };
  const isDirty = formInitialized && JSON.stringify(form) !== JSON.stringify(initialForm.current);
  return {
    form,
    setForm,
    formInitialized,
    isDirty,
    settingsRevision,
    studyReadState,
    resetInitialization,
    reloadSettings,
  };
}

export function useStudyFormFields(setForm: Dispatch<SetStateAction<StudyFormData>>) {
  const update = <K extends keyof StudyFormData>(key: K, value: StudyFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleFeature = (feature: string) => {
    setForm((prev) => ({ ...prev, features: toggleInArray(prev.features, feature) }));
  };

  const setModule: ModuleDraftChange = (moduleId, draft) => {
    if (draft.mode === 'disabled' && COLLECTION_MODULES.some((m) => m.value === moduleId && m.alwaysOn)) return;
    setForm((previous) => ({ ...previous, modules: { ...previous.modules, [moduleId]: draft } }));
  };

  const setParticipantPolicyField = (field: keyof ParticipantPolicyForm, value: string) => {
    setForm((previous) => ({
      ...previous,
      participantPolicy: { ...(previous.participantPolicy ?? EMPTY_PARTICIPANT_POLICY_FORM), [field]: value },
    }));
  };

  return { update, toggleFeature, setModule, setParticipantPolicyField };
}
