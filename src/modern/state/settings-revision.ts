// Study-settings revision, the optimistic-concurrency token for settings writes.
//
// The server publishes the revision as a strong `ETag` on every settings GET and on every
// settings PATCH response, and rejects a PATCH whose `If-Match` no longer matches with
// HTTP 412 (StudyController, StudySettingsPreconditionFailure). The dashboard remembers
// the last revision it saw per study and sends it back, so a form opened before another
// user's change cannot silently overwrite that change.

const revisions = new Map<string, string>();

/** Records the revision carried by a settings response; ignores responses without one. */
export function rememberSettingsRevision(studyId: string, headers?: Headers | null): void {
  const etag = headers?.get('etag');
  if (etag) revisions.set(studyId, etag);
}

/** The revision to send as `If-Match`; undefined when no settings response has been seen. */
export function knownSettingsRevision(studyId: string): string | undefined {
  return revisions.get(studyId);
}

/** Forgets a revision after a 412 so the refetched settings start the chain again. */
export function forgetSettingsRevision(studyId: string): void {
  revisions.delete(studyId);
}

export const SETTINGS_CONFLICT_STATUS = 412;

/** Thrown by the study save when a settings PATCH hit 412; the edit form reloads on it. */
export class StudySettingsConflictError extends Error {
  override name = 'StudySettingsConflictError';
}

export function isSettingsConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: unknown }).status === SETTINGS_CONFLICT_STATUS
  );
}
