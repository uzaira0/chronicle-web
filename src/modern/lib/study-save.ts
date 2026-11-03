import type { Translator } from '@/i18n';
import type translation from '@/i18n/en/translation.json';
import { getBlockingParticipantIds, getErrorMessage } from '@/lib/errors';
import { isSettingsConflict } from '@/state/settings-revision';

const SETTING_TYPES = ['ParticipantPolicy', 'Withdrawal', 'TimeUseDiary', 'DataCollection', 'AppUsageSurvey'] as const;
type SettingType = (typeof SETTING_TYPES)[number];

/** The separately persisted parts of a study save, in the order the UI names them. */
export const STUDY_SAVE_STEP = { details: 'details', limits: 'limits' } as const;
export const STUDY_SAVE_STEPS = [STUDY_SAVE_STEP.details, ...SETTING_TYPES, STUDY_SAVE_STEP.limits] as const;
export type StudySaveStep = (typeof STUDY_SAVE_STEPS)[number];

type SettingBody = Record<string, unknown>;

/** The settings PATCHes to send, in write order, skipping any the form does not produce. */
export function settingWrites(
  settings: Partial<Record<SettingType, SettingBody | null | undefined>>,
): Array<{ setting: SettingBody; settingType: SettingType }> {
  return SETTING_TYPES.flatMap((settingType) => {
    const setting = settings[settingType];
    return setting ? [{ setting, settingType }] : [];
  });
}

export type StudySaveFailure = { step: StudySaveStep; error: unknown };

export type StudySaveEnrollmentConflict = Readonly<{
  type: 'enrollment';
  message: string;
  participantIds: readonly string[];
}>;

type StudySaveConflict = StudySaveEnrollmentConflict | Readonly<{ type: 'settingsRevision' }>;

export function interpretSaveFailures(failures: readonly StudySaveFailure[], t: Translator['t']) {
  const interpreted = failures.map((failure) => ({
    ...failure,
    participantIds: getBlockingParticipantIds(failure.error),
    settingsConflict: isSettingsConflict(failure.error),
  }));
  const participantIds = [...new Set(interpreted.flatMap((failure) => failure.participantIds))];
  const conflicts: StudySaveConflict[] = [];
  if (participantIds.length > 0) {
    conflicts.push({ type: 'enrollment', participantIds, message: t('study_form.pending_enrollment') });
  }
  const generalFailures = interpreted.filter((failure) => failure.participantIds.length === 0);
  const settingsConflict = generalFailures.some((failure) => failure.settingsConflict);
  if (settingsConflict) conflicts.push({ type: 'settingsRevision' });
  const detailFailure = generalFailures.find((failure) => !failure.settingsConflict);
  const message = [
    settingsConflict ? t('study_layout.settings_conflict') : '',
    generalFailures.length > 0
      ? t('study_layout.changes_not_saved', {
          steps: studySaveStepList(
            generalFailures.map((failure) => failure.step),
            t,
          ),
        })
      : '',
    detailFailure ? getErrorMessage(detailFailure.error, '') : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { message, conflicts };
}

export class StudySaveError extends Error {
  readonly failures: readonly StudySaveFailure[];
  readonly conflicts: readonly StudySaveConflict[];

  constructor({
    failures,
    t,
  }: {
    failures: readonly StudySaveFailure[];
    t: Translator['t'];
  }) {
    const { conflicts, message } = interpretSaveFailures(failures, t);
    super(message);
    this.name = 'StudySaveError';
    this.failures = [...failures];
    this.conflicts = conflicts;
  }
}

/** Awaits one independent save step; a rejection becomes a named failure instead of a throw. */
export async function saveStep(step: StudySaveStep, work: Promise<unknown> | null): Promise<StudySaveFailure[]> {
  try {
    await work;
    return [];
  } catch (error) {
    return [{ step, error }];
  }
}

/**
 * Runs the settings PATCHes one after another (they share a read-merge-write of the full
 * settings map) and keeps going past an ordinary failure, so one rejected write does not
 * silently drop the rest. A failure for which `stops` is true ends the sequence; the steps
 * it never attempted are reported as not saved too.
 */
export async function writeSettingsInOrder<W extends { settingType: StudySaveStep }>(
  writes: readonly W[],
  write: (entry: W) => Promise<unknown>,
  stops: (error: unknown) => boolean = () => false,
): Promise<{ failures: StudySaveFailure[]; stopped: boolean }> {
  const failures: StudySaveFailure[] = [];
  for (const [index, entry] of writes.entries()) {
    try {
      await write(entry);
    } catch (error) {
      if (stops(error)) {
        failures.push(...writes.slice(index).map((w) => ({ step: w.settingType, error })));
        return { failures, stopped: true };
      }
      failures.push({ step: entry.settingType, error });
    }
  }
  return { failures, stopped: false };
}

type TranslationKey = `study_layout.${keyof typeof translation.study_layout}`;
const SAVE_STEP_LABELS: Record<StudySaveStep, TranslationKey> = {
  details: 'study_layout.save_step_details',
  ParticipantPolicy: 'study_layout.save_step_participant_policy',
  Withdrawal: 'study_layout.save_step_withdrawal',
  TimeUseDiary: 'study_layout.save_step_time_use_diary',
  AppUsageSurvey: 'study_layout.save_step_app_usage_survey',
  DataCollection: 'study_layout.save_step_data_collection',
  limits: 'study_layout.save_step_limits',
};

export const studySaveStepList = (steps: readonly StudySaveStep[], t: Translator['t']) =>
  steps.map((step) => t(SAVE_STEP_LABELS[step])).join(', ');
