type MemoryStorage = Storage & {
  dump: () => Record<string, string>;
};

function createMemoryStorage(seed: Record<string, string> = {}): MemoryStorage {
  const entries = new Map(Object.entries(seed));

  return {
    clear() {
      entries.clear();
    },
    dump() {
      return Object.fromEntries(entries.entries());
    },
    getItem(key) {
      return entries.has(key) ? (entries.get(key) ?? null) : null;
    },
    key(index) {
      return Array.from(entries.keys())[index] ?? null;
    },
    get length() {
      return entries.size;
    },
    removeItem(key) {
      entries.delete(key);
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
  };
}

type BrowserEnvOptions = {
  cookie?: string;
  url?: string;
};

// Saved originals so uninstall restores (rather than deletes) happy-dom globals
let savedDocument: typeof globalThis.document | undefined;
let savedLocalStorage: typeof globalThis.localStorage | undefined;
let savedWindow: typeof globalThis.window | undefined;

export function installBrowserEnv(options: BrowserEnvOptions = {}) {
  const { cookie = '', url = 'https://chronicle.test/chronicle' } = options;
  const localStorage = createMemoryStorage();
  const location = new URL(url);
  const window = { location } as unknown as Window & typeof globalThis;
  const document = { cookie } as unknown as Document;

  // Save the current globals (happy-dom or native) before overwriting
  savedDocument = globalThis.document;
  savedLocalStorage = globalThis.localStorage;
  savedWindow = globalThis.window;

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorage,
    writable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: window,
    writable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: document,
    writable: true,
  });

  return { document, localStorage, location, window };
}

export function uninstallBrowserEnv() {
  // Restore the previously saved globals instead of deleting them
  if (savedDocument !== undefined) {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: savedDocument, writable: true });
  }
  if (savedLocalStorage !== undefined) {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: savedLocalStorage, writable: true });
  }
  if (savedWindow !== undefined) {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: savedWindow, writable: true });
  }
  savedDocument = undefined;
  savedLocalStorage = undefined;
  savedWindow = undefined;
}
