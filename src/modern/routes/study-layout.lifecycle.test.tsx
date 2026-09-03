import { afterEach, describe, expect, test } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';

import { studyOperationsApi } from '@/state/study-operations-api';

import { getAuthoritativeStudyLifecycleStatus, getStudyLifecycleActionVisibility, StudyLayout } from './study-layout';

const savedFetch = globalThis.fetch;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

type FetchFixtureRoute = {
  matches: (url: string, method: string) => boolean;
  respond: (url: string, method: string) => Response;
};

function installFetchFixture(routes: FetchFixtureRoute[]) {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET');
      const route = routes.find((candidate) => candidate.matches(url, method));
      return Promise.resolve(route?.respond(url, method) ?? new Response('not found', { status: 404 }));
    },
    writable: true,
  });
}

afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: savedFetch,
    writable: true,
  });
});

describe('study lifecycle action visibility', () => {
  const hiddenActions = {
    showActions: false,
    showArchive: false,
    showDelete: false,
    showEdit: false,
    showRestore: false,
  };

  test('hides every management action while lifecycle status is unavailable', () => {
    expect(getStudyLifecycleActionVisibility(undefined)).toEqual(hiddenActions);
    expect(getStudyLifecycleActionVisibility(null)).toEqual(hiddenActions);
  });

  test('fails closed for an unrecognized runtime status', () => {
    expect(getStudyLifecycleActionVisibility('FUTURE_STATUS')).toEqual(hiddenActions);
  });

  test('shows only the archive action for an active study', () => {
    expect(getStudyLifecycleActionVisibility('ACTIVE')).toEqual({
      showActions: true,
      showArchive: true,
      showDelete: true,
      showEdit: true,
      showRestore: false,
    });
  });

  test('allows archived studies to be edited, restored, or deleted', () => {
    expect(getStudyLifecycleActionVisibility('ARCHIVED')).toEqual({
      showActions: true,
      showArchive: false,
      showDelete: true,
      showEdit: true,
      showRestore: true,
    });
  });

  test('allows only cancellation while a study is quarantined for deletion', () => {
    expect(getStudyLifecycleActionVisibility('SCHEDULED_FOR_DELETION')).toEqual({
      showActions: true,
      showArchive: false,
      showDelete: false,
      showEdit: false,
      showRestore: true,
    });
  });

  test('treats retained data as unavailable while a refetch is pending or failed', () => {
    expect(
      getAuthoritativeStudyLifecycleStatus({
        data: 'ACTIVE',
        isError: false,
        isFetching: false,
        isSuccess: true,
      }),
    ).toBe('ACTIVE');

    for (const queryState of [
      { data: 'ACTIVE' as const, isError: false, isFetching: true, isSuccess: true },
      { data: 'ACTIVE' as const, isError: true, isFetching: false, isSuccess: false },
    ]) {
      expect(getAuthoritativeStudyLifecycleStatus(queryState)).toBeUndefined();
    }
  });

  test('revokes cached ACTIVE actions and an open dialog after an invalid-status refetch', async () => {
    window.location.href = 'http://localhost/';
    let lifecycleStatus = 'ACTIVE';
    let archiveRequests = 0;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.endsWith('/study/cached-active/lifecycle')) {
          return Promise.resolve(
            new Response(JSON.stringify(lifecycleStatus), {
              headers: { 'content-type': 'application/json' },
              status: 200,
            }),
          );
        }
        if (url.endsWith('/study/cached-active/archive')) {
          archiveRequests += 1;
          return Promise.resolve(new Response('{}', { status: 200 }));
        }
        if (url.endsWith('/study/cached-active')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                description: 'Cached lifecycle regression',
                id: 'cached-active',
                modules: {},
                title: 'Cached Active Study',
              }),
              { headers: { 'content-type': 'application/json' }, status: 200 },
            ),
          );
        }
        return Promise.resolve(new Response('not found', { status: 404 }));
      },
      writable: true,
    });
    const store = configureStore({
      reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(studyOperationsApi.middleware),
    });

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/studies/cached-active']}>
          <Routes>
            <Route element={<StudyLayout />} path="/studies/:studyId" />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    const actionsTrigger = await screen.findByRole('button', { name: 'Study actions' });
    // Radix opens its menu on pointerdown, not click.
    fireEvent.pointerDown(actionsTrigger, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive Study' }));
    const dialog = await screen.findByRole('dialog');
    const staleConfirmation = within(dialog).getByRole('button', { name: 'Archive Study' });

    lifecycleStatus = 'FUTURE_STATUS';
    await act(async () => {
      const refetch = store.dispatch(
        studyOperationsApi.endpoints.getStudyLifecycleStatus.initiate('cached-active', { forceRefetch: true }),
      );
      await refetch;
      refetch.unsubscribe();
    });

    expect(screen.queryByRole('button', { name: 'Study actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Study' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/Study lifecycle status is unavailable/)).toBeTruthy();

    fireEvent.click(staleConfirmation);
    await act(async () => {
      await Promise.resolve();
    });
    expect(archiveRequests).toBe(0);

    expect(
      studyOperationsApi.endpoints.getStudyLifecycleStatus.select('cached-active')(store.getState()),
    ).toMatchObject({
      data: 'ACTIVE',
      error: {
        status: 'PARSING_ERROR',
      },
      isError: true,
    });
  });

  test('cancels scheduled deletion through the deletion endpoint instead of unarchive', async () => {
    window.location.href = 'http://localhost/';
    let cancellationRequests = 0;
    let unarchiveRequests = 0;
    installFetchFixture([
      {
        matches: (url) => url.endsWith('/study/scheduled/lifecycle'),
        respond: () =>
          new Response(JSON.stringify('SCHEDULED_FOR_DELETION'), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
      },
      {
        matches: (url) => url.endsWith('/study/scheduled/schedule-delete'),
        respond: (_url, method) => {
          cancellationRequests += 1;
          expect(method).toBe('POST');
          return new Response('{}', { headers: { 'content-type': 'application/json' }, status: 200 });
        },
      },
      {
        matches: (url) => url.endsWith('/study/scheduled/unarchive'),
        respond: () => {
          unarchiveRequests += 1;
          return new Response('{}', { headers: { 'content-type': 'application/json' }, status: 200 });
        },
      },
      {
        matches: (url) => url.endsWith('/study/scheduled'),
        respond: () =>
          new Response(
            JSON.stringify({
              description: 'Deletion cancellation regression',
              id: 'scheduled',
              modules: {},
              title: 'Scheduled Study',
            }),
            {
              headers: { 'content-type': 'application/json' },
              status: 200,
            },
          ),
      },
    ]);
    const store = configureStore({
      reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(studyOperationsApi.middleware),
    });

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/studies/scheduled']}>
          <Routes>
            <Route element={<StudyLayout />} path="/studies/:studyId" />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    const actionsTrigger = await screen.findByRole('button', { name: 'Study actions' });
    expect(screen.queryByRole('button', { name: 'Edit Study' })).toBeNull();
    fireEvent.pointerDown(actionsTrigger, { button: 0, ctrlKey: false });
    expect(screen.queryByRole('menuitem', { name: 'Delete Study' })).toBeNull();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancel Deletion' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/restore its previous lifecycle state/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel Deletion' }));

    await waitFor(() => expect(cancellationRequests).toBe(1));
    expect(unarchiveRequests).toBe(0);
  });

  test('schedules a reversible quarantine instead of calling the direct destroy endpoint', async () => {
    window.location.href = 'http://localhost/';
    let scheduleRequests = 0;
    let destroyRequests = 0;
    let requestedDeleteAfter = '';
    installFetchFixture([
      {
        matches: (url) => url.endsWith('/study/active/lifecycle'),
        respond: () =>
          new Response(JSON.stringify('ACTIVE'), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
      },
      {
        matches: (url) => url.includes('/study/active/schedule-delete?'),
        respond: (url, method) => {
          scheduleRequests += 1;
          expect(method).toBe('DELETE');
          requestedDeleteAfter = new URL(url).searchParams.get('deleteAfter') ?? '';
          return new Response('{}', { headers: { 'content-type': 'application/json' }, status: 200 });
        },
      },
      {
        matches: (url, method) => url.endsWith('/study/active') && method === 'DELETE',
        respond: () => {
          destroyRequests += 1;
          return new Response('[]', { headers: { 'content-type': 'application/json' }, status: 200 });
        },
      },
      {
        matches: (url) => url.endsWith('/study/active'),
        respond: () =>
          new Response(
            JSON.stringify({
              description: 'Deletion scheduling regression',
              id: 'active',
              modules: {},
              title: 'Active Study',
            }),
            { headers: { 'content-type': 'application/json' }, status: 200 },
          ),
      },
    ]);
    const store = configureStore({
      reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(studyOperationsApi.middleware),
    });

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/studies/active']}>
          <Routes>
            <Route element={<StudyLayout />} path="/studies/:studyId" />
            <Route element={<div>Study list</div>} path="/studies" />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    const actionsTrigger = await screen.findByRole('button', { name: 'Study actions' });
    fireEvent.pointerDown(actionsTrigger, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete Study' }));
    const dialog = await screen.findByRole('dialog');
    const confirmationInput = within(dialog).getByRole('textbox');
    const confirmationTitle = confirmationInput.getAttribute('placeholder');
    expect(confirmationTitle).toBeTruthy();
    fireEvent.change(confirmationInput, { target: { value: confirmationTitle } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Schedule Deletion' }));

    await waitFor(() => expect(scheduleRequests).toBe(1));
    expect(destroyRequests).toBe(0);
    expect(Number.isNaN(Date.parse(requestedDeleteAfter))).toBe(false);
  });
});
