import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { installRelativeRequest } from '@/test/http-fixtures';
import {
  expireSession,
  loginWithPassword,
  SESSION_STATUS,
  sessionListenerMiddleware,
  sessionReducer,
} from './session-slice';
import { SESSION_IDLE_DEADLINE_HEADER, studyOperationsApi } from './study-operations-api';

// The self-host dashboard JWT expires long before its cookie, so a researcher call answers 401
// mid-session. That must send the researcher back to sign-in rather than read as "no access".

let restoreRequest: () => void;

const saved = {
  document: globalThis.document,
  fetch: globalThis.fetch,
  localStorage: globalThis.localStorage,
  window: globalThis.window,
};
let requested: string[];
let reloadedTo: string[];
let responseStatus: number;
let responseIdleDeadline: string;
let responseDate: string;
let logoutActions: number;
let onLocked: (() => void) | undefined;
let csrfHeaders: (string | null)[];

const countLogouts: Middleware = () => (next) => (action) => {
  if (expireSession.match(action)) logoutActions += 1;
  const result = next(action);
  if (expireSession.match(action)) onLocked?.();
  return result;
};

function define(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
}

function createSessionStore() {
  return configureStore({
    middleware: (getDefault) =>
      getDefault().prepend(sessionListenerMiddleware.middleware).concat(countLogouts, studyOperationsApi.middleware),
    preloadedState: {
      session: {
        ...sessionReducer(undefined, { type: 'init' }),
        status: SESSION_STATUS.authenticated,
        user: { id: 'researcher', name: null, email: null, roles: [] },
      },
    },
    reducer: { session: sessionReducer, [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
  });
}

async function callWithExpiredSession<T>(endpoint: { initiate: (arg: T) => unknown }, arg: T, concurrentArg?: T) {
  const store = createSessionStore();
  const locked = new Promise<void>((resolve) => {
    onLocked = resolve;
  });
  // Endpoints differ in argument and result types; this helper only needs the subscription handle.
  const dispatch = store.dispatch as unknown as (action: unknown) => {
    unwrap: () => Promise<unknown>;
    abort: () => void;
    unsubscribe?: () => void;
  };
  const requests = (concurrentArg === undefined ? [arg] : [arg, concurrentArg]).map((value) =>
    dispatch(endpoint.initiate(value)),
  );
  const done = Promise.all(requests.map((request) => request.unwrap().catch(() => undefined)));
  await Promise.race([done, locked]);
  if (store.getState().session.status === SESSION_STATUS.locked) {
    for (const request of requests) request.abort();
  }
  await done;
  for (const request of requests) request.unsubscribe?.();
  return store.getState().session.status;
}

beforeEach(() => {
  requested = [];
  reloadedTo = [];
  responseStatus = 401;
  responseIdleDeadline = '';
  responseDate = '';
  logoutActions = 0;
  onLocked = undefined;
  csrfHeaders = [];
  define('document', { cookie: '' });
  restoreRequest = installRelativeRequest();
  define('localStorage', { removeItem: () => undefined });
  define('window', { location: { origin: 'http://localhost', replace: (url: string) => reloadedTo.push(url) } });
  define('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    requested.push(new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname);
    csrfHeaders.push(new Headers(input instanceof Request ? input.headers : init?.headers).get('X-CSRF-Token'));
    return Promise.resolve(
      new Response('{}', {
        headers: {
          'content-type': 'application/json',
          [SESSION_IDLE_DEADLINE_HEADER]: responseIdleDeadline,
          Date: responseDate,
        },
        status: responseStatus,
      }),
    );
  });
});

afterEach(() => {
  restoreRequest();
  for (const [name, value] of Object.entries(saved)) define(name, value);
});

describe('researcher session expiry', () => {
  it.each([-16, 16])('normalizes response idle deadlines with %i minutes of clock skew', async (skew) => {
    const serverNow = Date.parse('2026-10-08T12:00:00Z');
    const clientNow = serverNow + skew * 60_000;
    const idleWindow = 15 * 60_000;
    const clock = spyOn(Date, 'now').mockReturnValue(clientNow);
    responseStatus = 200;
    responseDate = new Date(serverNow).toUTCString();
    responseIdleDeadline = String(serverNow + idleWindow);
    const store = createSessionStore();
    try {
      for (const endpoint of [
        studyOperationsApi.endpoints.getStudySummary,
        studyOperationsApi.endpoints.getStudyLimits,
      ]) {
        type QueryResult = ReturnType<ReturnType<typeof endpoint.initiate>>;
        const request = store.dispatch<QueryResult>(endpoint.initiate('s1'));
        await request.unwrap();
        expect(store.getState().session.idleExpiresAt).toBe(clientNow + idleWindow);
        request.unsubscribe();
      }
    } finally {
      store.dispatch(studyOperationsApi.util.resetApiState());
      clock.mockRestore();
    }
  });

  it.each([
    studyOperationsApi.endpoints.getStudySummary,
    studyOperationsApi.endpoints.getStudyLimits,
  ])('refreshes the server idle deadline from researcher responses', async (endpoint) => {
    responseStatus = 200;
    responseIdleDeadline = String(Date.now() + 60_000);
    const store = createSessionStore();
    type QueryResult = ReturnType<ReturnType<typeof endpoint.initiate>>;
    const request = store.dispatch<QueryResult>(endpoint.initiate('s1'));
    await request.unwrap();
    expect(store.getState().session.idleExpiresAt).toBe(Number(responseIdleDeadline));
    const latestDeadline = Number(responseIdleDeadline);
    responseIdleDeadline = String(latestDeadline - 5_000);
    const older = store.dispatch<QueryResult>(endpoint.initiate('s1', { forceRefetch: true }));
    await older.unwrap();
    expect(store.getState().session.idleExpiresAt).toBe(latestDeadline);
    older.unsubscribe();
    request.unsubscribe();
    store.dispatch(studyOperationsApi.util.resetApiState());
  });

  it('sends the study IANA zone with diary grouping requests', async () => {
    responseStatus = 200;
    const original = globalThis.fetch;
    const groupingUrls: URL[] = [];
    define('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      groupingUrls.push(new URL(input instanceof Request ? input.url : String(input), 'http://localhost'));
      return original(input, init);
    });
    const store = createSessionStore();
    const request = store.dispatch(
      studyOperationsApi.endpoints.getStudyTudSubmissionGroups.initiate({
        studyId: 's1',
        startDate: '2026-09-06T04:00:00Z',
        endDate: '2026-09-08T03:00:00Z',
        timeZone: 'America/Santiago',
      }),
    );
    await request.unwrap();
    expect(groupingUrls[0]?.searchParams.get('timeZone')).toBe('America/Santiago');
    request.unsubscribe();
    store.dispatch(studyOperationsApi.util.resetApiState());
  });

  it.each(['researcher', 'different-user'])('retries only after the same researcher signs in: %s', async (userId) => {
    const store = createSessionStore();
    const locked = new Promise<void>((resolve) => {
      onLocked = resolve;
    });
    const request = store.dispatch(studyOperationsApi.endpoints.getStudySummary.initiate('s1'));
    let settled = false;
    const done = request.unwrap().then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await locked;
    expect(settled).toBe(false);
    responseStatus = 200;
    define('document', { cookie: 'ol_csrf_token=renewed-csrf' });
    store.dispatch(
      loginWithPassword.fulfilled(
        {
          ...store.getState().session,
          status: SESSION_STATUS.authenticated,
          tokenSource: 'dashboard-login',
          user: { id: userId, name: null, email: null, roles: [] },
        },
        'reauth',
        'test-password',
      ),
    );
    await done;
    expect(requested).toHaveLength(userId === 'researcher' ? 2 : 1);
    if (userId === 'researcher') expect(csrfHeaders.at(-1)).toBe('renewed-csrf');
    request.unsubscribe();
    store.dispatch(studyOperationsApi.util.resetApiState());
  });

  it('locks in place without reloading when a researcher call returns 401', async () => {
    const status = await callWithExpiredSession(studyOperationsApi.endpoints.getStudySummary, 's1');
    expect(status).toBe(SESSION_STATUS.locked);
    expect(logoutActions).toBe(1);
    expect(requested).toEqual(['/chronicle/api/web/study/s1']);
    expect(reloadedTo).toEqual([]);
  });

  it.each([
    studyOperationsApi.endpoints.getComplianceViolations,
    studyOperationsApi.endpoints.getStudyLimits,
  ])('locks once for concurrent queryFn 401s while authenticated', async (endpoint) => {
    const status = await callWithExpiredSession(endpoint, 's1', 's2');
    expect(status).toBe(SESSION_STATUS.locked);
    expect(logoutActions).toBe(1);
    expect(requested).toHaveLength(2);
    expect(reloadedTo).toEqual([]);
  });

  it.each([403, 429, 503])('leaves the session alone for a queryFn %i response', async (statusCode) => {
    responseStatus = statusCode;
    const status = await callWithExpiredSession(studyOperationsApi.endpoints.getComplianceViolations, 's1');
    expect(status).toBe(SESSION_STATUS.authenticated);
    expect(logoutActions).toBe(0);
    expect(requested).toEqual(['/chronicle/api/web/compliance/study/s1']);
    expect(reloadedTo).toEqual([]);
  });

  it('locks when access-code issuance returns 401', async () => {
    const status = await callWithExpiredSession(studyOperationsApi.endpoints.issueParticipantAccessCode, {
      studyId: 's1',
      participantId: 'p1',
      formKind: 'ENROLLMENT',
    });
    expect(status).toBe(SESSION_STATUS.locked);
    expect(logoutActions).toBe(1);
    expect(requested).toEqual(['/chronicle/api/web/study/s1/participant/p1/form-access-codes']);
    expect(reloadedTo).toEqual([]);
  });

  it('leaves the session alone when a participant form call returns 401', async () => {
    const status = await callWithExpiredSession(studyOperationsApi.endpoints.getTimeUseDiarySettings, 's1');
    expect(status).toBe(SESSION_STATUS.authenticated);
    expect(requested).toEqual(['/chronicle/v3/time-use-diary/s1/settings']);
  });
});
