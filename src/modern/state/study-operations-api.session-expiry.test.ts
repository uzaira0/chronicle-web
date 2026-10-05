import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';

import { AUTH_LOGOUT_ENDPOINT } from '@/lib/auth-endpoints';
import { sessionReducer } from './session-slice';
import { studyOperationsApi } from './study-operations-api';

// The self-host dashboard JWT expires long before its cookie, so a researcher call answers 401
// mid-session. That must send the researcher back to sign-in rather than read as "no access".

const SavedRequest = globalThis.Request;
class RelativeRequest extends SavedRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input, init);
  }
}

const saved = {
  document: globalThis.document,
  fetch: globalThis.fetch,
  localStorage: globalThis.localStorage,
  window: globalThis.window,
};
let requested: string[];
let reloadedTo: string[];

function define(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
}

async function callWithExpiredSession<T>(endpoint: { initiate: (arg: T) => unknown }, arg: T) {
  const store = configureStore({
    middleware: (getDefault) => getDefault().concat(studyOperationsApi.middleware),
    preloadedState: { session: { ...sessionReducer(undefined, { type: 'init' }), status: 'authenticated' as const } },
    reducer: { session: sessionReducer, [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
  });
  const request = store.dispatch(endpoint.initiate(arg) as never) as { unwrap: () => Promise<unknown> };
  await request.unwrap().catch(() => undefined);
  // Let the dispatched logout settle; microtasks only, since timers may be faked by earlier files.
  for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
  return store.getState().session.status;
}

beforeEach(() => {
  requested = [];
  reloadedTo = [];
  define('document', { cookie: '' });
  define('Request', RelativeRequest);
  define('localStorage', { removeItem: () => undefined });
  define('window', { location: { origin: 'http://localhost', replace: (url: string) => reloadedTo.push(url) } });
  define('fetch', (input: RequestInfo | URL) => {
    requested.push(new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname);
    return Promise.resolve(new Response('{}', { headers: { 'content-type': 'application/json' }, status: 401 }));
  });
});

afterEach(() => {
  define('Request', SavedRequest);
  for (const [name, value] of Object.entries(saved)) define(name, value);
});

describe('researcher session expiry', () => {
  it('signs out to the login screen when a researcher call returns 401', async () => {
    const status = await callWithExpiredSession(studyOperationsApi.endpoints.getStudySummary, 's1');
    expect(status).toBe('idle');
    expect(requested).toEqual(['/chronicle/api/web/study/s1', AUTH_LOGOUT_ENDPOINT]);
    expect(reloadedTo).toEqual(['http://localhost/']);
  });

  it('leaves the session alone when a participant form call returns 401', async () => {
    const status = await callWithExpiredSession(studyOperationsApi.endpoints.getTimeUseDiarySettings, 's1');
    expect(status).toBe('authenticated');
    expect(requested).toEqual(['/chronicle/v3/time-use-diary/s1/settings']);
  });
});
