import { afterAll, afterEach, expect, mock } from 'bun:test';
import { dirname } from 'node:path';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { installRelativeRequest } from './http-fixtures';

GlobalRegistrator.register();
installRelativeRequest();

const { cleanup } = await import('@testing-library/react');

// Test files share one store, so a real request outlives its test and its result lands in a
// later one. Unmocked requests reject at once and fail the test that made them.
const unmockedRequests: string[] = [];
globalThis.fetch = ((input: RequestInfo | URL) => {
  unmockedRequests.push(input instanceof Request ? input.url : String(input));
  return Promise.reject(new TypeError('unmocked fetch in test'));
}) as typeof fetch;

// Unmount React trees before removing remaining DOM, including portals and their effects.
afterEach(() => {
  if (typeof document !== 'undefined' && document.querySelectorAll) {
    const ids = Array.from(document.querySelectorAll('[id]'), ({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  }
  cleanup();
  if (typeof document !== 'undefined' && document.body) {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  }
  if (unmockedRequests.length > 0) {
    throw new Error(`unmocked network request(s): ${unmockedRequests.splice(0).join(', ')}`);
  }
});

// bun keeps a module mock for the rest of the run and rewrites already-imported namespaces in
// place, so a mock left by one file replaces that module in every later file (files run in
// directory order, which changes whenever a file is rewritten). Each mock is undone when the
// file that made it finishes. The real exports are captured before the first mock ever made.
const mockModule = mock.module.bind(mock);
const realModules = new Map<string, Record<string, unknown>>();
const restoring = new Set<string>();
mock.module = (async (specifier: string, factory: () => unknown) => {
  const path = Bun.resolveSync(specifier, dirname(Bun.main));
  if (!realModules.has(path)) realModules.set(path, { ...((await import(path)) as Record<string, unknown>) });
  const owner = `${Bun.main}\n${path}`;
  if (!restoring.has(owner)) {
    restoring.add(owner);
    afterAll(() => mockModule(path, () => realModules.get(path)));
  }
  return mockModule(path, factory);
}) as typeof mock.module;

// A failing matcher formats the received value natively. On a React-mounted node it walks the
// __reactFiber/__reactProps links into the whole app and never finishes, so print markup instead.
Object.defineProperty(Node.prototype, Bun.inspect.custom, {
  value(this: Node) {
    const markup = this instanceof Element ? this.outerHTML : String(this.textContent);
    return markup.length > 500 ? `${markup.slice(0, 500)}…` : markup;
  },
});

// Fibers and the roots holding them reach the whole app the same way; print their kind only.
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.createElement('div'));
const fiberRoot = (root as unknown as { _internalRoot: { current: object } })._internalRoot;
for (const value of [root, fiberRoot, fiberRoot.current]) {
  Object.defineProperty(Object.getPrototypeOf(value), Bun.inspect.custom, {
    value(this: object) {
      return `[${this.constructor.name}]`;
    },
  });
}
root.unmount();
