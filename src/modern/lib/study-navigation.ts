export const PARTIAL_STUDY_CONFIGURATION_ERROR =
  'The study was created, but some requested settings or limits failed to save. Review and save its configuration again.';

/** The separately persisted parts of a study save, in the order the UI names them. */
export const STUDY_SAVE_STEPS = [
  'details',
  'ParticipantPolicy',
  'AndroidSensor',
  'Sensor',
  'DataCollection',
  'limits',
] as const;
export type StudySaveStep = (typeof STUDY_SAVE_STEPS)[number];

type StudyNavigationState = {
  actionError: string;
  failedSteps: StudySaveStep[];
};

type SettingType = 'ParticipantPolicy' | 'AndroidSensor' | 'Sensor' | 'DataCollection';
type SettingBody = Record<string, unknown> | unknown[];

/** The settings PATCHes to send, in write order, skipping any the form does not produce. */
export function settingWrites(
  settings: Partial<Record<SettingType, SettingBody | null | undefined>>,
): Array<{ setting: SettingBody; settingType: SettingType }> {
  return (['ParticipantPolicy', 'AndroidSensor', 'Sensor', 'DataCollection'] as const).flatMap((settingType) => {
    const setting = settings[settingType];
    return setting ? [{ setting, settingType }] : [];
  });
}

export type StudySaveFailure = { step: StudySaveStep; error: unknown };

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

export function studyConfigurationNavigationState(
  failedSteps: readonly StudySaveStep[],
): StudyNavigationState | undefined {
  return failedSteps.length > 0
    ? { actionError: PARTIAL_STUDY_CONFIGURATION_ERROR, failedSteps: [...failedSteps] }
    : undefined;
}

export function studyNavigationActionError(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('actionError' in state)) {
    return null;
  }
  return typeof state.actionError === 'string' && state.actionError.trim().length > 0 ? state.actionError : null;
}

export function studyNavigationFailedSteps(state: unknown): StudySaveStep[] {
  if (typeof state !== 'object' || state === null || !('failedSteps' in state) || !Array.isArray(state.failedSteps)) {
    return [];
  }
  return state.failedSteps.filter((step): step is StudySaveStep => STUDY_SAVE_STEPS.includes(step as StudySaveStep));
}
