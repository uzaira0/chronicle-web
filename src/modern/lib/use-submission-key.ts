import { useCallback, useRef } from 'react';

/**
 * One Idempotency-Key per logical form submission. A retry with the same payload after a failed
 * or timed-out submit reuses the key, so the server's receipt dedupe drops the duplicate. A
 * changed payload gets a fresh key: the server rejects a reused key whose payload differs, which
 * would otherwise leave the form stuck. `rotateKey` after a success.
 */
export function useSubmissionKey() {
  const ref = useRef<{ key: string; payload: string } | null>(null);
  const currentKey = useCallback((payload: unknown) => {
    const serialized = JSON.stringify(payload);
    if (ref.current?.payload !== serialized) ref.current = { key: crypto.randomUUID(), payload: serialized };
    return ref.current.key;
  }, []);
  const rotateKey = useCallback(() => {
    ref.current = null;
  }, []);
  return { currentKey, rotateKey };
}
