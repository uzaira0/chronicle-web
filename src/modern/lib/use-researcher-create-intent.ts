type Intent = { storageKey: string; key: string };
type StoredIntent = { key: string; createdAt: number; expiresAt: number | null };
export const RESEARCHER_CREATE_RETRY_WINDOW_MS = 15 * 60_000;
const memory = new Map<string, StoredIntent>();
const STORAGE_PREFIX = 'chronicle-create-intent:';

function storedIntent(storageKey: string): StoredIntent | undefined {
  try {
    const raw = localStorage.getItem(storageKey);
    const stored = (raw ? JSON.parse(raw) : null) as Partial<StoredIntent> | null;
    if (
      typeof stored?.key === 'string' &&
      typeof stored.createdAt === 'number' &&
      Number.isFinite(stored.createdAt) &&
      (stored.expiresAt === null || (typeof stored.expiresAt === 'number' && Number.isFinite(stored.expiresAt)))
    ) {
      return { key: stored.key, createdAt: stored.createdAt, expiresAt: stored.expiresAt };
    }
  } catch {
    /* Storage may be disabled or contain an older, unversioned key. */
  }
  return undefined;
}

function browserLocks(): LockManager | undefined {
  const browser = globalThis as { navigator?: { locks?: LockManager } };
  return browser.navigator?.locks;
}

async function pruneExpiredIntents(now: number): Promise<void> {
  const keys = new Set(memory.keys());
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) keys.add(key);
    }
  } catch {
    /* Storage may be disabled. */
  }
  const locks = browserLocks();
  for (const key of keys) {
    const prune = () => {
      const intent = storedIntent(key) ?? memory.get(key);
      if (intent && (intent.expiresAt === null || (now >= intent.createdAt && now < intent.expiresAt))) return;
      memory.delete(key);
      try {
        localStorage.removeItem(key);
      } catch {
        /* Storage may be disabled. */
      }
    };
    if (locks) await locks.request(key, prune);
    else prune();
  }
}

/** Only a payload digest, opaque key and creation time are persisted; request bodies stay in memory. */
export async function researcherCreateIntent(
  scope: string,
  payload: unknown,
  retryWindowMs: number | null = RESEARCHER_CREATE_RETRY_WINDOW_MS,
): Promise<Intent> {
  await pruneExpiredIntents(Date.now());
  const bytes = new TextEncoder().encode(JSON.stringify([scope, payload]));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  const storageKey = `${STORAGE_PREFIX}${digest}`;
  const obtain = () => {
    let intent = storedIntent(storageKey) ?? memory.get(storageKey);
    const now = Date.now();
    if (!intent || (retryWindowMs !== null && (now < intent.createdAt || now - intent.createdAt >= retryWindowMs))) {
      intent = {
        key: crypto.randomUUID(),
        createdAt: now,
        expiresAt: retryWindowMs === null ? null : now + retryWindowMs,
      };
    }
    memory.set(storageKey, intent);
    try {
      localStorage.setItem(storageKey, JSON.stringify(intent));
    } catch {
      /* Retain the in-memory retry identity. */
    }
    return { storageKey, key: intent.key };
  };
  // The same outstanding intent opened in another tab shares its key. Locks serialize first creation.
  const locks = browserLocks();
  return locks ? locks.request(storageKey, obtain) : obtain();
}

export async function acknowledgeResearcherCreate(intent: Intent): Promise<void> {
  const clear = () => {
    if (memory.get(intent.storageKey)?.key === intent.key) memory.delete(intent.storageKey);
    try {
      if (storedIntent(intent.storageKey)?.key === intent.key) localStorage.removeItem(intent.storageKey);
    } catch {
      /* No persistent storage was available. */
    }
  };
  const locks = browserLocks();
  if (locks) await locks.request(intent.storageKey, clear);
  else clear();
}

export function useResearcherCreateIntent(scope: string) {
  return {
    currentIntent: (payload: unknown) => researcherCreateIntent(scope, payload),
    acknowledge: acknowledgeResearcherCreate,
  };
}
