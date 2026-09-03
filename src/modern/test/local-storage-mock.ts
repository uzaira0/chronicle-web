/**
 * Shared localStorage mock for store tests.
 * Import this at the top of any test file that needs localStorage.
 */
const storage = new Map<string, string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function installLocalStorageMock() {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      get length() {
        return storage.size;
      },
      key: (index: number) => [...storage.keys()][index] ?? null,
    },
    writable: true,
    configurable: true,
  });
}

export function clearLocalStorageMock() {
  storage.clear();
}

export function readPersistedState(key: string): Record<string, unknown> {
  const raw = localStorage.getItem(key);
  if (!raw) {
    throw new Error(`Expected persisted localStorage entry "${key}".`);
  }

  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || !isRecord(parsed.state)) {
    throw new Error(`Expected "${key}" to contain an object-valued state property.`);
  }

  return parsed.state;
}

// Auto-install on import
installLocalStorageMock();
