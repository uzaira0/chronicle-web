import { useRef } from 'react';

type Intent = { storageKey: string; key: string };
const memory = new Map<string, string>();

/** Only a payload digest and opaque key are persisted; request bodies and credentials stay in memory. */
export async function researcherCreateIntent(scope: string, payload: unknown): Promise<Intent> {
  const bytes = new TextEncoder().encode(JSON.stringify([scope, payload]));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
  const storageKey = `chronicle-create-intent:${digest}`;
  const obtain = () => {
    let key = memory.get(storageKey);
    try { key = localStorage.getItem(storageKey) ?? key; } catch { /* Storage may be disabled. */ }
    if (!key) key = crypto.randomUUID();
    memory.set(storageKey, key);
    try { localStorage.setItem(storageKey, key); } catch { /* Retain the in-memory retry identity. */ }
    return { storageKey, key };
  };
  // The same outstanding intent opened in another tab shares its key. Locks serialize first creation.
  return globalThis.navigator?.locks ? navigator.locks.request(storageKey, obtain) : obtain();
}

export async function acknowledgeResearcherCreate(intent: Intent): Promise<void> {
  const clear = () => {
    if (memory.get(intent.storageKey) === intent.key) memory.delete(intent.storageKey);
    try {
      if (localStorage.getItem(intent.storageKey) === intent.key) localStorage.removeItem(intent.storageKey);
    } catch { /* No persistent storage was available. */ }
  };
  if (globalThis.navigator?.locks) await navigator.locks.request(intent.storageKey, clear);
  else clear();
}

export function useResearcherCreateIntent(scope: string) {
  const current = useRef<Intent | undefined>(undefined);
  return {
    currentKey: async (payload: unknown) => {
      const intent = await researcherCreateIntent(scope, payload);
      current.current = intent;
      return intent.key;
    },
    rotateKey: async () => {
      const acknowledged = current.current;
      if (acknowledged) await acknowledgeResearcherCreate(acknowledged);
      if (current.current === acknowledged) current.current = undefined;
    },
  };
}
