import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';

import { initializeBootstrapSession, requestDashboardLogin } from '@/lib/bootstrap-auth';
import { getErrorMessage } from '@/lib/errors';
import { REQUEST_TIMEOUT_MS } from '@/lib/request-timeout';

import { fetchWithCsrf, studyOperationsApi } from './study-operations-api';

// production-readiness U5 / ai-built-code B6: a backend that accepts the connection and never
// answers must not leave a spinner up forever. Every call gives up after REQUEST_TIMEOUT_MS.

let savedFetch: typeof globalThis.fetch;
const SavedRequest = globalThis.Request;
// fetchBaseQuery builds `new Request('/chronicle/api/web/...')`; outside a browser a relative
// URL has no base, so resolve it against a dummy origin the way the page would.
class RelativeRequest extends SavedRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input, init);
  }
}
let savedDocument: typeof globalThis.document | undefined;
let fetchStarted: Promise<void>;
let calls: { init: RequestInit | undefined; input: RequestInfo | URL }[];

function signalOf(input: RequestInfo | URL, init: RequestInit | undefined): AbortSignal | undefined {
  return init?.signal ?? (input instanceof Request ? input.signal : undefined);
}

/** A server that never answers; the request ends only when its signal aborts. */
function installHungFetch() {
  calls = [];
  let started: () => void = () => {};
  fetchStarted = new Promise((resolve) => {
    started = resolve;
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ init, input });
      started();
      const signal = signalOf(input, init);
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason as Error));
      });
    },
    writable: true,
  });
}

async function afterTimeout() {
  await fetchStarted;
  jest.advanceTimersByTime(REQUEST_TIMEOUT_MS + 1);
}

type Outcome =
  | { status: 'pending' }
  | { status: 'fulfilled'; value: unknown }
  | { status: 'rejected'; reason: unknown };

/** Settles `promise` by draining microtasks only: with fake timers a hung request would otherwise hang the test. */
async function outcome(promise: Promise<unknown>): Promise<Outcome> {
  let result: Outcome = { status: 'pending' };
  promise.then(
    (value) => {
      result = { status: 'fulfilled', value };
    },
    (reason: unknown) => {
      result = { status: 'rejected', reason };
    },
  );
  for (let i = 0; i < 1000 && result.status === 'pending'; i++) await Promise.resolve();
  return result;
}

beforeEach(() => {
  savedFetch = globalThis.fetch;
  savedDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { cookie: '' },
    writable: true,
  });
  Object.defineProperty(globalThis, 'Request', { configurable: true, value: RelativeRequest, writable: true });
  jest.useFakeTimers();
  installHungFetch();
});

afterEach(() => {
  jest.useRealTimers();
  Object.defineProperty(globalThis, 'Request', { configurable: true, value: SavedRequest, writable: true });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: savedDocument, writable: true });
});

describe('request timeouts', () => {
  it('fetchWithCsrf rejects with TimeoutError when the server never answers', async () => {
    const request = fetchWithCsrf('/chronicle/api/web/compliance/study/s1');
    await afterTimeout();
    expect(await outcome(request)).toMatchObject({ reason: { name: 'TimeoutError' }, status: 'rejected' });
  });

  it('fetchWithCsrf keeps a signal the caller passed', async () => {
    const controller = new AbortController();
    void fetchWithCsrf('/x', { signal: controller.signal }).catch(() => {});
    await fetchStarted;
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it('an RTK Query endpoint ends in TIMEOUT_ERROR with a timeout sentence', async () => {
    const store = configureStore({
      middleware: (getDefault) => getDefault().concat(studyOperationsApi.middleware),
      reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
    });
    const query = store.dispatch(studyOperationsApi.endpoints.getStudySummary.initiate('s1'));
    await afterTimeout();
    const settled = await outcome(query);
    query.unsubscribe();
    expect(settled.status).toBe('fulfilled');
    const { error } = (settled as { value: { error?: unknown } }).value;
    expect(error).toMatchObject({ status: 'TIMEOUT_ERROR' });
    expect(getErrorMessage(error, 'Could not load the study.')).toContain('did not answer in time');
  });

  it('a queryFn endpoint built on fetchWithCsrf also ends in TIMEOUT_ERROR', async () => {
    const store = configureStore({
      middleware: (getDefault) => getDefault().concat(studyOperationsApi.middleware),
      reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
    });
    const query = store.dispatch(studyOperationsApi.endpoints.getComplianceViolations.initiate('s1'));
    await afterTimeout();
    const settled = await outcome(query);
    query.unsubscribe();
    expect(settled.status).toBe('fulfilled');
    expect((settled as { value: { error?: unknown } }).value.error).toMatchObject({ status: 'TIMEOUT_ERROR' });
  });

  it('the dashboard session bootstrap gives up instead of spinning', async () => {
    const session = initializeBootstrapSession();
    await afterTimeout();
    expect(await outcome(session)).toMatchObject({ reason: { name: 'TimeoutError' }, status: 'rejected' });
  });

  it('the dashboard password login reports sign-in unavailable', async () => {
    const login = requestDashboardLogin('secret');
    await afterTimeout();
    const settled = await outcome(login);
    expect(settled.status).toBe('rejected');
    expect((settled as { reason: Error }).reason.message).toContain('Sign-in is temporarily unavailable');
  });
});
