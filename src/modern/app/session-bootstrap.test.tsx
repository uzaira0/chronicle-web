import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { QueryStatus } from '@reduxjs/toolkit/query';
import { act, cleanup, fireEvent, getConfig, render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, type RouteObject, useRoutes } from 'react-router';
import {
  PARTICIPATION_STATUSES,
  SESSION_IDLE_WINDOW_MS_FIELD,
  USER_ACTIVITY_HEADER,
} from '@/generated/chronicle-contracts';
import { AUTH_SESSION_ENDPOINT } from '@/lib/auth-endpoints';
import { logoutSession as performLogout, SIGN_OUT_FAILED_MESSAGE } from '@/lib/auth-utils';
import { REQUEST_TIMEOUT_MS } from '@/lib/request-timeout';

import { bootstrapSession, loginWithPassword, logoutSession, SESSION_STATUS } from '@/state/session-slice';
import { store } from '@/state/store';
import { studyOperationsApi } from '@/state/study-operations-api';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { modernRoutes } from '@/test/route-fixtures';
import { SessionBootstrap } from './session-bootstrap';

// JwtBlocklist response metadata cannot renew idle without local input.
const RESPONSE_IDLE_DEADLINE_HEADER = 'X-Session-Idle-Expires-At';
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalSetInterval = globalThis.setInterval;
const originalWindowSetTimeoutDescriptor = Object.getOwnPropertyDescriptor(window, 'setTimeout');
const originalWindowSetTimeout = window.setTimeout.bind(window);
const originalWindowSetIntervalDescriptor = Object.getOwnPropertyDescriptor(window, 'setInterval');
const originalWindowSetInterval = window.setInterval.bind(window);
let restoreRequest: (() => void) | undefined;

beforeEach(() => {
  store.dispatch(logoutSession.fulfilled(undefined, 'reset', undefined));
});

afterEach(() => {
  cleanup();
  store.dispatch(studyOperationsApi.util.resetApiState());
  store.dispatch(logoutSession.fulfilled(undefined, 'reset', undefined));
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.setInterval = originalSetInterval;
  if (originalWindowSetTimeoutDescriptor)
    Object.defineProperty(window, 'setTimeout', originalWindowSetTimeoutDescriptor);
  else Reflect.deleteProperty(window, 'setTimeout');
  if (originalWindowSetIntervalDescriptor)
    Object.defineProperty(window, 'setInterval', originalWindowSetIntervalDescriptor);
  else Reflect.deleteProperty(window, 'setInterval');
  restoreRequest?.();
  restoreRequest = undefined;
  mock.restore();
});

function acceleratedDelay(delay: number | undefined): number | undefined {
  return Number(delay) >= 1_000 ? 10 : delay;
}

function accelerateTimers(): void {
  globalThis.setTimeout = Object.assign(
    (...[handler, delay, ...args]: Parameters<typeof setTimeout>) =>
      originalSetTimeout(handler, acceleratedDelay(delay), ...args),
    originalSetTimeout,
  );
  globalThis.setInterval = Object.assign(
    (...[handler, delay, ...args]: Parameters<typeof setInterval>) =>
      originalSetInterval(handler, acceleratedDelay(delay), ...args),
    originalSetInterval,
  );
  window.setTimeout = Object.assign(
    (...[handler, delay, ...args]: Parameters<typeof window.setTimeout>) =>
      originalWindowSetTimeout.call(window, handler, acceleratedDelay(delay), ...args),
    originalWindowSetTimeout,
  );
  window.setInterval = Object.assign(
    (...[handler, delay, ...args]: Parameters<typeof window.setInterval>) =>
      originalWindowSetInterval.call(window, handler, acceleratedDelay(delay), ...args),
    originalWindowSetInterval,
  );
}

test('accelerates long application timers through all four browser entry points', async () => {
  accelerateTimers();
  const fired = new Set<string>();
  globalThis.setTimeout(() => fired.add('global timeout'), 1_000);
  window.setTimeout(() => fired.add('window timeout'), 60_000);
  const globalInterval = globalThis.setInterval(() => fired.add('global interval'), 1_000);
  const windowInterval = window.setInterval(() => fired.add('window interval'), 60_000);
  try {
    await new Promise<void>((resolve) => originalSetTimeout(resolve, 30));
    expect([...fired].sort()).toEqual(['global interval', 'global timeout', 'window interval', 'window timeout']);
  } finally {
    globalThis.clearInterval(globalInterval);
    window.clearInterval(windowInterval);
  }
});

// Keep the assertion harness on its real clock while every application timer is accelerated.
async function waitForWithRealTimers(assertion: () => void): Promise<void> {
  const deadline = Date.now() + getConfig().asyncUtilTimeout;
  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await act(() => new Promise<void>((resolve) => originalSetTimeout(resolve, 10)));
    }
  }
}

function renderAuthenticatedGate(
  expiresAt: number | null,
  idleExpiresAt: number | null = null,
  idleWindowMs: number | null = null,
) {
  store.dispatch(
    bootstrapSession.fulfilled(
      {
        ...store.getState().session,
        expiresAt,
        idleExpiresAt,
        [SESSION_IDLE_WINDOW_MS_FIELD]: idleWindowMs,
        status: SESSION_STATUS.authenticated,
        tokenSource: 'dashboard-login',
      },
      'authenticated',
      undefined,
    ),
  );
  render(
    <MemoryRouter>
      <Provider store={store}>
        <SessionBootstrap>
          <button type="button">Private action</button>
        </SessionBootstrap>
      </Provider>
    </MemoryRouter>,
  );
}

function input(trusted: boolean) {
  const event = new Event('keydown', { bubbles: true });
  Object.defineProperty(event, 'isTrusted', { value: trusted });
  fireEvent(document, event);
}

test('trusted input renews an unsaved form on the session endpoint and coalesces repeated input', async () => {
  const requests: Headers[] = [];
  // The probe schedule and the activity header both read performance.now; drive it so real time under load
  // cannot move either.
  const clock = spyOn(performance, 'now').mockReturnValue(1_000);
  const pause = () => act(() => new Promise<void>((resolve) => originalSetTimeout(resolve, 30)));
  const idleWindowMs = 60_000;
  globalThis.fetch = routeFetch({
    [`GET ${AUTH_SESSION_ENDPOINT}`]: (request) => {
      requests.push(request.headers);
      return Response.json({ authenticated: true });
    },
  });
  restoreRequest = installRelativeRequest();
  accelerateTimers();
  try {
    renderAuthenticatedGate(Date.now() + 60_000, Date.now() + idleWindowMs, idleWindowMs);
    input(false);
    await pause();
    expect(requests).toHaveLength(0);
    input(true);
    await waitForWithRealTimers(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.get(USER_ACTIVITY_HEADER)).toBe('0');
    // A second input is held until half the idle window after the first report, however long real time runs.
    clock.mockReturnValue(1_010);
    input(true);
    await pause();
    clock.mockReturnValue(1_000 + idleWindowMs / 2 - 1);
    await pause();
    expect(requests).toHaveLength(1);
    clock.mockReturnValue(1_000 + idleWindowMs / 2);
    await waitForWithRealTimers(() => expect(requests).toHaveLength(2));
    // It carries the age of the second input at send time, not of the first.
    expect(requests[1]?.get(USER_ACTIVITY_HEADER)).toBe(String(idleWindowMs / 2 - 10));
    clock.mockReturnValue(1_010 + idleWindowMs / 2);
    input(true);
    await waitForWithRealTimers(() => expect(requests).toHaveLength(3));
    expect(requests[2]?.get(USER_ACTIVITY_HEADER)).toBe('0');
    await pause();
    expect(requests).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Private action' })).toBeTruthy();
  } finally {
    clock.mockRestore();
  }
});

// A probe lost to a busy server, a dropped connection or an unreadable reply keeps the input it carried, so an
// active researcher is not locked out by one failed keep-alive.
const PROBE_FAILURES = {
  busy: () => new Response(null, { status: 503 }),
  offline: () => {
    throw new TypeError('Failed to fetch');
  },
  unreadable: () => new Response('<html>proxy error</html>', { status: 200 }),
} satisfies Record<string, () => Response>;

test.each([
  [0, 'busy'],
  [REQUEST_TIMEOUT_MS, 'busy'],
  [REQUEST_TIMEOUT_MS, 'offline'],
  [REQUEST_TIMEOUT_MS, 'unreadable'],
] as const)(
  'a failed input probe after %i ms (%s) retries its original age within one request budget',
  async (elapsed, failure) => {
    const requests: string[] = [];
    const clock = spyOn(performance, 'now').mockReturnValue(100);
    globalThis.fetch = routeFetch({
      [`GET ${AUTH_SESSION_ENDPOINT}`]: (request) => {
        requests.push(request.headers.get(USER_ACTIVITY_HEADER) ?? 'missing');
        if (requests.length === 1) {
          clock.mockReturnValue(100 + elapsed);
          return PROBE_FAILURES[failure]();
        }
        return Response.json({ authenticated: true });
      },
    });
    restoreRequest = installRelativeRequest();
    accelerateTimers();
    try {
      renderAuthenticatedGate(Date.now() + 60_000, Date.now() + 60_000, 60_000);
      input(true);
      if (elapsed === 0) {
        await waitForWithRealTimers(() => expect(requests).toHaveLength(1));
        await act(() => new Promise<void>((resolve) => originalSetTimeout(resolve, 20)));
        expect(requests).toHaveLength(1);
        clock.mockReturnValue(100 + REQUEST_TIMEOUT_MS + 1);
      }
      const deadline = store.getState().session.idleExpiresAt;
      await waitForWithRealTimers(() => expect(requests).toHaveLength(2));
      expect(requests).toEqual(['0', String(REQUEST_TIMEOUT_MS + (elapsed === 0 ? 1 : 0))]);
      expect(store.getState().session.idleExpiresAt).toBe(deadline);
      expect(store.getState().session.lastReportedActivityAt).toBe(100);
      await act(() => new Promise<void>((resolve) => originalSetTimeout(resolve, 20)));
      expect(requests).toHaveLength(2);
    } finally {
      clock.mockRestore();
    }
  },
);

test('locks private views at the absolute deadline without another API request', async () => {
  renderAuthenticatedGate(Date.now() + 500);
  expect(screen.getByRole('button', { name: 'Private action' })).toBeTruthy();
  await screen.findByLabelText(/dashboard password/i);
  expect(screen.queryByRole('button', { name: 'Private action' })).toBeNull();
  expect(store.getState().session.status).toBe(SESSION_STATUS.locked);
});

test('never displays private views for an already expired session', () => {
  renderAuthenticatedGate(Date.now() - 1);
  expect(screen.queryByRole('button', { name: 'Private action' })).toBeNull();
  expect(screen.getByLabelText(/dashboard password/i)).toBeTruthy();
});

test('successful sign-out in another window locks private views before their deadline', async () => {
  globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 200 }))) as unknown as typeof fetch;
  spyOn(window.location, 'replace').mockImplementation(() => undefined);
  renderAuthenticatedGate(Date.now() + 60_000);
  expect(screen.getByRole('button', { name: 'Private action' })).toBeTruthy();

  // The transport runs in the signing-out window; only its channel can change this gate's store.
  await act(async () => {
    await performLogout();
  });
  await screen.findByLabelText(/dashboard password/i);
  expect(screen.queryByRole('button', { name: 'Private action' })).toBeNull();
  expect(store.getState().session.status).toBe(SESSION_STATUS.locked);
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});

test('locks private views at the server idle deadline without another request', async () => {
  renderAuthenticatedGate(Date.now() + 60_000, Date.now() + 100);
  await screen.findByLabelText(/dashboard password/i);
  expect(screen.queryByRole('button', { name: 'Private action' })).toBeNull();
  expect(store.getState().session.status).toBe(SESSION_STATUS.locked);
});

function idleStudyFetch(studyId: string, idleDeadline: number, requests: string[]): typeof fetch {
  const routed = routeFetch({
    ...Object.fromEntries(
      (
        [
          [`/chronicle/api/web/study/${studyId}`, { id: studyId, title: 'Idle study', modules: {} }],
          ['/chronicle/api/web/study', []],
          [`/chronicle/api/web/study/${studyId}/lifecycle`, 'ACTIVE'],
          [`/chronicle/api/web/study/${studyId}/deletions`, []],
          [`/chronicle/api/web/study/${studyId}/settings/locks`, []],
          [`/chronicle/api/web/study/${studyId}/export/availability`, { dataTypes: [], timeUseDiary: false }],
          [`/chronicle/api/web/compliance/study/${studyId}`, {}],
          [`/chronicle/api/web/study/${studyId}/settings/audit`, []],
          [`/chronicle/api/web/study/${studyId}/settings/acknowledgments`, []],
          [`/chronicle/api/web/study/${studyId}/api-keys`, []],
          [`/chronicle/api/web/limits/study/${studyId}`, {}],
          [`/chronicle/api/web/study/${studyId}/settings/type/DataCollection`, { modules: {} }],
          [`/chronicle/api/web/survey/${studyId}/questionnaire`, []],
          [`/chronicle/api/web/study/${studyId}/pending-enrollments`, ['idle-participant']],
          [
            `/chronicle/api/web/study/${studyId}/participants`,
            [
              {
                participantId: 'idle-participant',
                participationStatus: PARTICIPATION_STATUSES[0],
                candidate: { id: 'idle-participant' },
                participantTags: [],
              },
            ],
          ],
          [`/chronicle/api/web/study/${studyId}/participants/stats`, {}],
        ] as const
      ).map(([path, body]) => [
        `GET ${path}`,
        (request: Request) => {
          expect(request.headers.has(USER_ACTIVITY_HEADER)).toBe(false);
          return Response.json(body, { headers: { [RESPONSE_IDLE_DEADLINE_HEADER]: String(idleDeadline) } });
        },
      ]),
    ),
    'POST /chronicle/api/web/authorizations': () => Response.json([]),
  });
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(`${request.method} ${new URL(request.url).pathname}`);
    return routed(request);
  }) as typeof fetch;
}

function researcherPagePaths(routes: RouteObject[], prefix = ''): string[] {
  return routes.flatMap((route) => {
    const path = `${prefix}/${route.path ?? ''}`.replaceAll('//', '/');
    return route.children ? researcherPagePaths(route.children, path) : [path.replace('*', 'missing-page')];
  });
}

const researcherRoutes = modernRoutes.find((route) => route.path === '/');
if (!researcherRoutes?.children) throw new Error('The researcher route table is missing');

function RoutedDashboard() {
  return <Suspense fallback={<span data-testid="idle-route-loading" />}>{useRoutes(modernRoutes)}</Suspense>;
}

test.each(researcherPagePaths(researcherRoutes.children))(
  '%s does not keep an idle dashboard signed in',
  async (page) => {
    restoreRequest = installRelativeRequest();
    accelerateTimers();
    const idleWindow = 2_000;
    const studyId = 'idle-study';
    const requests: string[] = [];
    const initialDeadline = Date.now() + idleWindow;
    globalThis.fetch = idleStudyFetch(studyId, initialDeadline, requests);
    store.dispatch(
      bootstrapSession.fulfilled(
        {
          ...store.getState().session,
          expiresAt: null,
          idleExpiresAt: initialDeadline,
          [SESSION_IDLE_WINDOW_MS_FIELD]: idleWindow,
          status: SESSION_STATUS.authenticated,
          tokenSource: 'dashboard-login',
        },
        'idle-session',
        undefined,
      ),
    );
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[page.replace(':studyId', studyId)]}>
          <RoutedDashboard />
        </MemoryRouter>
      </Provider>,
    );
    await waitForWithRealTimers(() => {
      expect(screen.queryByTestId('idle-route-loading')).toBeNull();
      expect(store.getState().session.status).toBe(SESSION_STATUS.authenticated);
      const queries = Object.values(store.getState()[studyOperationsApi.reducerPath].queries);
      expect(
        queries
          .filter((query) => query?.status === QueryStatus.rejected)
          .map((query) => ({
            endpoint: query?.endpointName,
            error: query?.error,
          })),
      ).toEqual([]);
      expect(queries.some((query) => query?.status === QueryStatus.pending)).toBe(false);
    });
    await act(() => new Promise<void>((resolve) => originalSetTimeout(resolve, idleWindow)));
    expect(screen.getByLabelText(/dashboard password/i)).toBeTruthy();
    expect(store.getState().session.status).toBe(SESSION_STATUS.locked);
    expect(store.getState().session.idleExpiresAt).toBe(initialDeadline);
  },
);

test('failed sign-out locks private views and offers a retry', async () => {
  globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 429 }))) as unknown as typeof fetch;
  renderAuthenticatedGate(null);
  await act(async () => {
    await store.dispatch(logoutSession());
  });
  expect(screen.queryByRole('button', { name: 'Private action' })).toBeNull();
  expect(screen.getByRole('alert').textContent).toBe(SIGN_OUT_FAILED_MESSAGE);
  fireEvent.click(screen.getByRole('button', { name: 'Retry sign-out' }));
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
});

test('clears cached private queries when sign-in changes researcher identity', async () => {
  renderAuthenticatedGate(null);
  const studyId = 'private-study';
  await store.dispatch(studyOperationsApi.util.upsertQueryData('getStudySummary', studyId, { id: studyId }));
  const selectStudy = studyOperationsApi.endpoints.getStudySummary.select(studyId);
  expect(selectStudy(store.getState()).data).toBeDefined();
  act(() => {
    store.dispatch(
      loginWithPassword.fulfilled(
        {
          ...store.getState().session,
          status: SESSION_STATUS.authenticated,
          tokenSource: 'dashboard-login',
          user: { id: 'different-user', email: null, name: null, roles: [] },
        },
        'switch-user',
        'test-password',
      ),
    );
  });
  expect(selectStudy(store.getState()).data).toBeUndefined();
});

// WCAG 2.2 AA: the bootstrapping and error panels are whole pages, so they
// need a main landmark or axe's landmark rules fail on every route before sign-in.
describe('SessionBootstrap landmarks', () => {
  test('bootstrapping and error states render inside a main landmark', () => {
    globalThis.fetch = mock(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
    render(
      <Provider store={store}>
        <SessionBootstrap>
          <p>app</p>
        </SessionBootstrap>
      </Provider>,
    );
    expect(screen.getByRole('main')).toBeTruthy();

    act(() => {
      store.dispatch(bootstrapSession.rejected(new Error('502'), 'req', undefined, 'boom'));
    });
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

// A dashboard whose session probe answers with a server error says so in the dashboard's words with the status, rather
// than the transport's English sentence, and offers a retry.
test('a session probe that answers 500 shows the translated failure with its status', async () => {
  globalThis.fetch = routeFetch({
    [`GET ${AUTH_SESSION_ENDPOINT}`]: () => new Response('upstream down', { status: 500 }),
  });
  restoreRequest = installRelativeRequest();
  await store.dispatch(bootstrapSession());
  render(
    <Provider store={store}>
      <SessionBootstrap>
        <p>app</p>
      </SessionBootstrap>
    </Provider>,
  );
  expect(screen.getByText('The session request failed (status 500).')).toBeTruthy();
  expect(screen.queryByText('app')).toBeNull();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
});
