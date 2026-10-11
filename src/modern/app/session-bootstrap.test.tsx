import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { QueryStatus } from '@reduxjs/toolkit/query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { SIGN_OUT_FAILED_MESSAGE } from '@/lib/auth-utils';

import {
  bootstrapSession,
  loginWithPassword,
  logoutSession,
  SESSION_STATUS,
  updateIdleDeadline,
} from '@/state/session-slice';
import { store } from '@/state/store';
import { SESSION_IDLE_DEADLINE_HEADER, studyOperationsApi } from '@/state/study-operations-api';
import { installRelativeRequest } from '@/test/http-fixtures';
import { SessionBootstrap } from './session-bootstrap';

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
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
  restoreRequest?.();
  restoreRequest = undefined;
  mock.restore();
});

function renderAuthenticatedGate(expiresAt: number | null) {
  store.dispatch(
    bootstrapSession.fulfilled(
      {
        ...store.getState().session,
        expiresAt,
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

test('locks private views at the server idle deadline without another request', async () => {
  renderAuthenticatedGate(Date.now() + 60_000);
  await act(() => Promise.resolve().then(() => store.dispatch(updateIdleDeadline(Date.now() + 100))));
  await screen.findByLabelText(/dashboard password/i);
  expect(screen.queryByRole('button', { name: 'Private action' })).toBeNull();
  expect(store.getState().session.status).toBe(SESSION_STATUS.locked);
});

test('study limits and an active export do not keep an idle dashboard signed in', async () => {
  restoreRequest = installRelativeRequest();
  // Route tests can mock these hooks globally; exercise the real subscriptions here.
  const apiModule = await import('@/state/study-operations-api');
  const realHooks = Object.fromEntries(Object.entries(studyOperationsApi).filter(([key]) => key.startsWith('use')));
  await mock.module('@/state/study-operations-api', () => ({ ...apiModule, ...realHooks }));
  const { StudyLayout } = await import('@/routes/study-layout');
  const { StudyBulkDownloadsPage } = await import('@/routes/study-bulk-downloads-page');
  const formerPollingIntervals = new Set([5_000, 60_000]);
  // Accelerate any restored poll so either poll alone would keep renewing the short idle window.
  // A plain wrapper, not a spy: testing-library treats a mocked setTimeout as fake timers.
  globalThis.setTimeout = Object.assign(
    (...[handler, delay, ...args]: Parameters<typeof setTimeout>) =>
      originalSetTimeout(handler, formerPollingIntervals.has(Number(delay)) ? 10 : delay, ...args),
    originalSetTimeout,
  );
  const idleWindow = 300;
  const studyId = 'idle-study';
  const requests: string[] = [];
  globalThis.fetch = mock((input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    requests.push(url.pathname);
    let body: unknown = {};
    if (url.pathname.endsWith(`/study/${studyId}`)) body = { id: studyId, title: 'Idle study', modules: {} };
    else if (url.pathname.endsWith('/lifecycle')) body = 'ACTIVE';
    else if (url.pathname.endsWith('/questionnaire')) body = [];
    else if (url.pathname.endsWith('/export')) {
      body = [
        {
          exportId: 'running-export',
          studyId,
          status: 'RUNNING',
          format: 'CSV',
          rowCount: 0,
          createdAt: new Date().toISOString(),
        },
      ];
    }
    return Promise.resolve(
      Response.json(body, {
        headers: { [SESSION_IDLE_DEADLINE_HEADER]: String(Date.now() + idleWindow) },
      }),
    );
  }) as unknown as typeof fetch;
  store.dispatch(
    bootstrapSession.fulfilled(
      {
        ...store.getState().session,
        expiresAt: null,
        idleExpiresAt: Date.now() + idleWindow,
        status: SESSION_STATUS.authenticated,
        tokenSource: 'dashboard-login',
      },
      'idle-session',
      undefined,
    ),
  );
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/studies/${studyId}`]}>
        <SessionBootstrap>
          <Routes>
            <Route element={<StudyLayout />} path="/studies/:studyId">
              <Route index element={<StudyBulkDownloadsPage />} />
            </Route>
          </Routes>
        </SessionBootstrap>
      </MemoryRouter>
    </Provider>,
  );
  await screen.findByText('running-export');
  await waitFor(() => {
    const queries = Object.values(store.getState()[studyOperationsApi.reducerPath].queries);
    expect(queries.some((query) => query?.status === QueryStatus.pending)).toBe(false);
  });
  const initialRequests = requests.length;
  const initialDeadline = store.getState().session.idleExpiresAt;
  await screen.findByLabelText(/dashboard password/i);
  expect(store.getState().session.status).toBe(SESSION_STATUS.locked);
  expect(store.getState().session.idleExpiresAt).toBe(initialDeadline);
  expect(requests).toHaveLength(initialRequests);
  expect(screen.queryByRole('button', { name: 'Start export' })).toBeNull();
});

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

// legal X1 (WCAG 2.2 AA): the bootstrapping and error panels are whole pages, so they
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
