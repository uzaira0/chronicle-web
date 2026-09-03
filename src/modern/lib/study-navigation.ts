export const PARTIAL_STUDY_CONFIGURATION_ERROR =
  'The study was created, but some requested settings or limits failed to save. Review and save its configuration again.';

type StudyNavigationState = {
  actionError: string;
};

export function studyConfigurationNavigationState(
  results: ReadonlyArray<PromiseSettledResult<unknown>>,
): StudyNavigationState | undefined {
  return results.some((result) => result.status === 'rejected')
    ? { actionError: PARTIAL_STUDY_CONFIGURATION_ERROR }
    : undefined;
}

export function studyNavigationActionError(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('actionError' in state)) {
    return null;
  }
  return typeof state.actionError === 'string' && state.actionError.trim().length > 0 ? state.actionError : null;
}
