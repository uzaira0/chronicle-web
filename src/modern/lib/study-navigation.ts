import { STUDY_FEATURES } from './study-constants';
import { STUDY_SAVE_STEPS, type StudySaveStep } from './study-save';

export const PARTIAL_STUDY_CONFIGURATION_ERROR =
  'The study was created, but some requested settings or limits failed to save. Review and save its configuration again.';

const FEATURE_LABELS = new Map<string, string>(STUDY_FEATURES.map(({ label, value }) => [value, label]));

export function studyFeatureLabel(moduleId: string): string {
  return FEATURE_LABELS.get(moduleId) ?? moduleId.replace(/_/g, ' ');
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
