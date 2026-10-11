import { useCallback } from 'react';

/**
 * Keep one Idempotency-Key per form resource until success is acknowledged, including reloads.
 * A changed retry conflicts with the committed receipt instead of storing a second submission.
 * Store only the key, never the answers. `rotateKey` after a successful response.
 */
export function useSubmissionKey(resource: readonly string[]) {
  const storageKey = `chronicle.participant.submission.${JSON.stringify(resource)}`;
  const currentKey = useCallback(() => {
    const key = window.sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, key);
    return key;
  }, [storageKey]);
  const rotateKey = useCallback(() => {
    window.sessionStorage.removeItem(storageKey);
  }, [storageKey]);
  return { currentKey, rotateKey };
}
