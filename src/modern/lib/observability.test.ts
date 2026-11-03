import { afterEach, expect, jest, test } from 'bun:test';
import { BROWSER_ERROR_KIND, BROWSER_ERROR_REPORT_PATH, RESEARCHER_CSRF_HEADER } from '@/generated/chronicle-contracts';
import { REQUEST_TIMEOUT_MS } from '@/lib/request-timeout';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { initGlobalErrorHandlers, reportError } from './observability';

const savedFetch = globalThis.fetch;
const savedCookie = Object.getOwnPropertyDescriptor(document, 'cookie');
let removeHandlers: (() => void) | undefined;
let restoreRequest: (() => void) | undefined;
afterEach(() => {
  removeHandlers?.();
  globalThis.fetch = savedFetch;
  restoreRequest?.();
  if (savedCookie) Object.defineProperty(document, 'cookie', savedCookie);
  else Reflect.deleteProperty(document, 'cookie');
});

test('global failures send only the server kind contract with same-origin cookie CSRF', async () => {
  const requests: Request[] = [];
  restoreRequest = installRelativeRequest();
  globalThis.fetch = routeFetch({
    [`POST ${BROWSER_ERROR_REPORT_PATH}`]: (request) => {
      requests.push(request);
      return new Response(null, { status: 204 });
    },
  });
  Object.defineProperty(document, 'cookie', { configurable: true, value: 'ol_csrf_token=fixture-csrf' });
  const cleanup = initGlobalErrorHandlers();
  if (typeof cleanup === 'function') removeHandlers = cleanup;
  window.dispatchEvent(
    new ErrorEvent('error', { error: new Error('private participant sentinel'), message: 'private URL sentinel' }),
  );
  const rejected = new Event('unhandledrejection');
  Object.defineProperty(rejected, 'reason', { value: new Error('private rejection sentinel') });
  window.dispatchEvent(rejected);
  await Promise.resolve();
  expect(requests).toHaveLength(2);
  expect(await Promise.all(requests.map((request) => request.json()))).toEqual([
    { kind: BROWSER_ERROR_KIND.ERROR },
    { kind: BROWSER_ERROR_KIND.UNHANDLED_REJECTION },
  ]);
  for (const request of requests) {
    expect(new URL(request.url).pathname).toBe(BROWSER_ERROR_REPORT_PATH);
    expect(request.credentials).toBe('same-origin');
    expect(request.headers.get(RESEARCHER_CSRF_HEADER)).toBe('fixture-csrf');
  }
});

// A backend that accepts the report and never answers must not hold the request open forever.
test('an error report to a backend that never answers is abandoned at the request deadline', () => {
  jest.useFakeTimers();
  try {
    const signals: (AbortSignal | undefined)[] = [];
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal ?? undefined;
      signals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted', { cause: signal.reason })));
      });
    }) as unknown as typeof fetch;

    reportError();

    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);
    jest.advanceTimersByTime(REQUEST_TIMEOUT_MS + 1);
    expect(signals[0]?.aborted).toBe(true);
    expect((signals[0]?.reason as DOMException | undefined)?.name).toBe('TimeoutError');
  } finally {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  }
});
