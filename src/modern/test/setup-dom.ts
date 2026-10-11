import { afterEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

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

// A failing matcher formats the received value natively. On a React-mounted node it walks the
// __reactFiber/__reactProps links into the whole app and never finishes, so print markup instead.
Object.defineProperty(Node.prototype, Bun.inspect.custom, {
  value(this: Node) {
    const markup = this instanceof Element ? this.outerHTML : String(this.textContent);
    return markup.length > 500 ? `${markup.slice(0, 500)}…` : markup;
  },
});
