import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { USER_ACTIVITY_HEADER } from '@/generated/chronicle-contracts';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import {
  bootstrapSession,
  expireSession,
  loginWithPassword,
  recordUserActivity,
  SESSION_STATUS,
  sessionListenerMiddleware,
  sessionReducer,
} from './session-slice';
import { studyOperationsApi } from './study-operations-api';

// JwtBlocklist.IDLE_DEADLINE_HEADER is adversarial response metadata here; background reads cannot extend idle.
const RESPONSE_IDLE_DEADLINE_HEADER = 'X-Session-Idle-Expires-At';

// The self-host dashboard JWT expires long before its cookie, so a researcher call answers 401
// mid-session. That must send the researcher back to sign-in rather than read as "no access".

let restoreRequest: () => void;

const TEST_TOKEN_SOURCE = 'dashboard-login' as const;

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
        tokenSource: TEST_TOKEN_SOURCE,
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
  define(
    'fetch',
    routeFetch(
      Object.fromEntries(
        [
          'GET /chronicle/api/web/study/s1',
          'GET /chronicle/api/web/study/s1/pending-enrollments',
          'GET /chronicle/api/web/limits/study/s1',
          'GET /chronicle/api/web/limits/study/s2',
          'GET /chronicle/api/web/compliance/study/s1',
          'GET /chronicle/api/web/compliance/study/s2',
          'POST /chronicle/api/web/study/s1/participant/p1/form-access-codes',
          'GET /chronicle/v3/time-use-diary/s1/settings',
          'GET /chronicle/api/web/time-use-diary/s1/ids',
        ].map((key) => [
          key,
          (request: Request) => {
            requested.push(new URL(request.url).pathname);
            csrfHeaders.push(request.headers.get('X-CSRF-Token'));
            return Response.json(
              {},
              {
                headers: { [RESPONSE_IDLE_DEADLINE_HEADER]: responseIdleDeadline, Date: responseDate },
                status: responseStatus,
              },
            );
          },
        ]),
      ),
    ),
  );
});

afterEach(() => {
  restoreRequest();
  for (const [name, value] of Object.entries(saved)) define(name, value);
});

describe('researcher session expiry', () => {
  it.each([-16, 16])(
    'background responses cannot establish an idle deadline with %i minutes of clock skew',
    async (skew) => {
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
          expect(store.getState().session.idleExpiresAt).toBeNull();
          request.unsubscribe();
        }
      } finally {
        store.dispatch(studyOperationsApi.util.resetApiState());
        clock.mockRestore();
      }
    },
  );

  it.each([studyOperationsApi.endpoints.getPendingEnrollments, studyOperationsApi.endpoints.getStudySummary])(
    'forced query refreshes preserve pending input without extending the idle session',
    async (endpoint) => {
      responseStatus = 200;
      const headers: (string | null)[] = [];
      const original = globalThis.fetch;
      define('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
        headers.push(new Request(input, init).headers.get(USER_ACTIVITY_HEADER));
        return original(input, init);
      });
      const store = createSessionStore();
      store.dispatch(recordUserActivity(Date.now()));
      const pending = store.getState().session.pendingUserActivityAt;
      const request =
        endpoint === studyOperationsApi.endpoints.getPendingEnrollments
          ? store.dispatch(studyOperationsApi.endpoints.getPendingEnrollments.initiate('s1', { forceRefetch: true }))
          : store.dispatch(studyOperationsApi.endpoints.getStudySummary.initiate('s1', { forceRefetch: true }));
      try {
        await request.unwrap();
        expect(headers).toEqual([null]);
        expect(store.getState().session.pendingUserActivityAt).toBe(pending);
      } finally {
        request.unsubscribe();
        store.dispatch(studyOperationsApi.util.resetApiState());
      }
    },
  );

  it.each([studyOperationsApi.endpoints.getStudySummary, studyOperationsApi.endpoints.getStudyLimits])(
    'background responses cannot extend the browser idle deadline',
    async (endpoint) => {
      responseStatus = 200;
      responseIdleDeadline = String(Date.now() + 60_000);
      const store = createSessionStore();
      type QueryResult = ReturnType<ReturnType<typeof endpoint.initiate>>;
      const request = store.dispatch<QueryResult>(endpoint.initiate('s1'));
      await request.unwrap();
      expect(store.getState().session.idleExpiresAt).toBeNull();
      const latestDeadline = Number(responseIdleDeadline);
      responseIdleDeadline = String(latestDeadline - 5_000);
      const older = store.dispatch<QueryResult>(endpoint.initiate('s1', { forceRefetch: true }));
      await older.unwrap();
      expect(store.getState().session.idleExpiresAt).toBeNull();
      older.unsubscribe();
      request.unsubscribe();
      store.dispatch(studyOperationsApi.util.resetApiState());
    },
  );

  it.each([studyOperationsApi.endpoints.getStudySummary, studyOperationsApi.endpoints.getStudyLimits])(
    'sends one activity signal after local input and ignores subsequent background deadlines',
    async (endpoint) => {
      responseStatus = 200;
      const activityHeaders: (string | null)[] = [];
      const original = globalThis.fetch;
      define('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        activityHeaders.push(request.headers.get(USER_ACTIVITY_HEADER));
        return original(request);
      });
      const store = createSessionStore();
      const started = Date.now();
      store.dispatch(
        bootstrapSession.fulfilled(
          {
            ...store.getState().session,
            idleExpiresAt: started + 60_000,
            idleWindowMs: 60_000,
            status: SESSION_STATUS.authenticated,
            tokenSource: TEST_TOKEN_SOURCE,
          },
          'activity-test',
          undefined,
        ),
      );
      const originalDeadline = store.getState().session.idleExpiresAt;
      // Whole milliseconds: a fractional performance.now() can make (t + 500) - t floor to 499.
      const clock = spyOn(performance, 'now').mockReturnValue(10_000);
      const input = recordUserActivity(started + 1_000);
      clock.mockReturnValue(10_500);
      store.dispatch(input);
      expect(store.getState().session.idleExpiresAt).toBeGreaterThan(originalDeadline ?? 0);
      const localDeadline = store.getState().session.idleExpiresAt;
      responseIdleDeadline = String(started + 600_000);
      try {
        for (let requestIndex = 0; requestIndex < 2; requestIndex += 1) {
          type QueryResult = ReturnType<ReturnType<typeof endpoint.initiate>>;
          const request = store.dispatch<QueryResult>(endpoint.initiate('s1', { forceRefetch: requestIndex > 0 }));
          await request.unwrap();
          request.unsubscribe();
          expect(store.getState().session.idleExpiresAt).toBe(localDeadline);
        }
        expect(activityHeaders).toEqual(['500', null]);
      } finally {
        clock.mockRestore();
        store.dispatch(studyOperationsApi.util.resetApiState());
      }
    },
  );

  it.each([studyOperationsApi.endpoints.getStudySummary, studyOperationsApi.endpoints.getStudyLimits])(
    'requeues the actual input when either transport fails',
    async (endpoint) => {
      responseStatus = 503;
      const store = createSessionStore();
      const now = Date.now();
      store.dispatch(
        bootstrapSession.fulfilled(
          {
            ...store.getState().session,
            idleExpiresAt: now + 60_000,
            idleWindowMs: 60_000,
            status: SESSION_STATUS.authenticated,
            tokenSource: TEST_TOKEN_SOURCE,
          },
          'failed-activity',
          undefined,
        ),
      );
      const input = recordUserActivity(now);
      store.dispatch(input);
      type QueryResult = ReturnType<ReturnType<typeof endpoint.initiate>>;
      const request = store.dispatch<QueryResult>(endpoint.initiate('s1'));
      await request.unwrap().catch(() => undefined);
      expect(store.getState().session.pendingUserActivityAt).toBe(input.payload.observedAt);
      expect(store.getState().session.lastReportedActivityAt).toBeNull();
      expect(store.getState().session.userActivityRetryAt).toBeGreaterThan(input.payload.observedAt);
      expect(store.getState().session.idleExpiresAt).toBe(now + 60_000);
      request.unsubscribe();
      store.dispatch(studyOperationsApi.util.resetApiState());
    },
  );

  it('sends the study IANA zone with diary grouping requests', async () => {
    responseStatus = 200;
    const original = globalThis.fetch;
    const groupingUrls: URL[] = [];
    define(
      'fetch',
      routeFetch({
        'GET /chronicle/api/web/time-use-diary/s1/ids': (request) => {
          groupingUrls.push(new URL(request.url));
          return original(request);
        },
      }),
    );
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
          tokenSource: TEST_TOKEN_SOURCE,
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

  // The study page's own reads (limits, lifecycle) and the access-code calls go through fetchWithCsrf, which repeats
  // the call itself after the researcher signs back in: with the renewed CSRF cookie, without the stale token when
  // sign-in left none, and locking again when the repeated call is still refused.
  it.each([
    ['renewed-csrf', 200, 'renewed-csrf', SESSION_STATUS.authenticated, 1],
    ['', 200, null, SESSION_STATUS.authenticated, 1],
    ['renewed-csrf', 401, 'renewed-csrf', SESSION_STATUS.locked, 2],
  ] as const)(
    'a limits read repeated after sign-in with cookie %j answering %i sends %j',
    async (cookie, retryStatus, sentCsrf, finalStatus, locks) => {
      define('document', { cookie: 'ol_csrf_token=stale-csrf' });
      const store = createSessionStore();
      const locked = new Promise<void>((resolve) => {
        onLocked = resolve;
      });
      const request = store.dispatch(studyOperationsApi.endpoints.getStudyLimits.initiate('s1'));
      const result = request.unwrap().then(
        () => 'ok',
        () => 'failed',
      );
      await locked;
      onLocked = undefined;
      responseStatus = retryStatus;
      define('document', { cookie: cookie ? `ol_csrf_token=${cookie}` : '' });
      store.dispatch(
        loginWithPassword.fulfilled(
          { ...store.getState().session, status: SESSION_STATUS.authenticated, tokenSource: TEST_TOKEN_SOURCE },
          'reauth',
          'test-password',
        ),
      );
      expect(await result).toBe(retryStatus === 200 ? 'ok' : 'failed');
      expect(requested).toEqual(['/chronicle/api/web/limits/study/s1', '/chronicle/api/web/limits/study/s1']);
      expect(csrfHeaders).toEqual(['stale-csrf', sentCsrf]);
      expect(store.getState().session.status).toBe(finalStatus);
      expect(logoutActions).toBe(locks);
      request.unsubscribe();
      store.dispatch(studyOperationsApi.util.resetApiState());
    },
  );

  it('locks in place without reloading when a researcher call returns 401', async () => {
    const status = await callWithExpiredSession(studyOperationsApi.endpoints.getStudySummary, 's1');
    expect(status).toBe(SESSION_STATUS.locked);
    expect(logoutActions).toBe(1);
    expect(requested).toEqual(['/chronicle/api/web/study/s1']);
    expect(reloadedTo).toEqual([]);
  });

  it.each([studyOperationsApi.endpoints.getComplianceViolations, studyOperationsApi.endpoints.getStudyLimits])(
    'locks once for concurrent queryFn 401s while authenticated',
    async (endpoint) => {
      const status = await callWithExpiredSession(endpoint, 's1', 's2');
      expect(status).toBe(SESSION_STATUS.locked);
      expect(logoutActions).toBe(1);
      expect(requested).toHaveLength(2);
      expect(reloadedTo).toEqual([]);
    },
  );

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
