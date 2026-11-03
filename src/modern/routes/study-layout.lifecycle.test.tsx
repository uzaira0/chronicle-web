import { afterEach, describe, expect, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { STUDY_LIFECYCLE_STATUSES } from '@/generated/chronicle-contracts';
import { buildStudyParticipantPolicy } from '@/lib/participant-policy';
import { STUDY_SAVE_STEPS } from '@/lib/study-save';
import { type StudyLifecycleStatus, studyOperationsApi } from '@/state/study-operations-api';
import { routeFetch } from '@/test/http-fixtures';
import { VALID_PARTICIPANT_POLICY } from '@/test/participant-policy';
import { createApiStore } from '@/test/study-operations-store';
import { StudyLayout } from './study-layout';
import {
  getAuthoritativeStudyLifecycleStatus,
  getStudyLifecycleActionVisibility,
  StudyLifecycleActions,
  getStudyLifecycleActionVisibility as visibilityFor,
} from './study-layout/lifecycle-actions';

const savedFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: savedFetch,
    writable: true,
  });
});

const hiddenActions = {
  showActions: false,
  showArchive: false,
  showDelete: false,
  showEdit: false,
  showRestore: false,
};

test.each([false, true])(
  'a dirty module draft survives reconnect (summary failure: %s) and saves only after authority returns',
  async (failSummary) => {
    window.location.href = 'http://localhost/';
    const studyId = 'reconnect';
    const studyPath = `/chronicle/api/web/study/${studyId}`;
    const lifecycle = Promise.withResolvers<Response>();
    let reconnecting = false;
    let summaryUnavailable = false;
    const writes: { setting: string; body: Record<string, unknown> }[] = [];
    const snapshot = (body: unknown) => Response.json(body, { headers: { etag: '"one"' } });
    globalThis.fetch = routeFetch({
      [`GET ${studyPath}/lifecycle`]: () => (reconnecting ? lifecycle.promise : Response.json('ACTIVE')),
      [`GET ${studyPath}`]: () => {
        if (summaryUnavailable) throw new TypeError('Network interrupted');
        return snapshot({
          id: studyId,
          title: 'Pilot study',
          contact: 'study-team@example.org',
          modules: { CHRONICLE_DATA_COLLECTION: {} },
          settings: {
            DataCollection: {
              modules: {
                usage_events: { enabled: true, required: true },
                in_app_activity_class: { enabled: true, required: false },
              },
            },
          },
        });
      },
      [`GET /chronicle/api/web/limits/study/${studyId}`]: () => snapshot(null),
      [`GET ${studyPath}/settings/locks`]: () => snapshot([]),
      [`GET ${studyPath}/settings`]: () =>
        snapshot({ ParticipantPolicy: buildStudyParticipantPolicy(VALID_PARTICIPANT_POLICY) }),
      [`PATCH ${studyPath}`]: () => snapshot({}),
      ...Object.fromEntries(
        STUDY_SAVE_STEPS.filter((step) => !['details', 'limits'].includes(step)).map((setting) => [
          `PATCH ${studyPath}/settings/type/${setting}`,
          async (request: Request) => {
            writes.push({ setting, body: (await request.json()) as Record<string, unknown> });
            return snapshot({});
          },
        ]),
      ),
    });
    const store = createApiStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[`/studies/${studyId}`]}>
          <Routes>
            <Route element={<StudyLayout />} path="/studies/:studyId" />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Edit study' }));
    const dialog = await screen.findByRole('dialog');
    let module = await within(dialog).findByRole('group', { name: 'In-App Activity collection mode' });
    fireEvent.click(within(module).getByRole('radio', { name: 'Required' }));
    let save = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Save changes' });
    await waitFor(() => expect(save.disabled).toBe(false));
    reconnecting = true;
    summaryUnavailable = failSummary;
    await act(() => store.dispatch(studyOperationsApi.internalActions.onOnline()));
    await waitFor(() =>
      expect(studyOperationsApi.endpoints.getStudyLifecycleStatus.select(studyId)(store.getState()).isLoading).toBe(
        true,
      ),
    );
    if (failSummary)
      await waitFor(() =>
        expect(studyOperationsApi.endpoints.getStudySummary.select(studyId)(store.getState()).isError).toBe(true),
      );
    expect(screen.getByRole('dialog')).toBe(dialog);
    if (failSummary) {
      summaryUnavailable = false;
      await act(async () => {
        const refetch = store.dispatch(
          studyOperationsApi.endpoints.getStudySummary.initiate(studyId, { forceRefetch: true }),
        );
        await refetch;
        refetch.unsubscribe();
      });
      module = await within(dialog).findByRole('group', { name: 'In-App Activity collection mode' });
      save = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Save changes' });
    }
    expect(save.disabled).toBe(true);
    fireEvent.submit(save.closest('form') as HTMLFormElement);
    expect(writes).toHaveLength(0);
    await act(() => {
      lifecycle.resolve(Response.json('ACTIVE'));
      return lifecycle.promise;
    });
    await waitFor(() => expect(save.disabled).toBe(false));
    expect(within(module).getByRole<HTMLInputElement>('radio', { name: 'Required' }).checked).toBe(true);
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const dataCollection = writes.find(({ setting }) => setting === 'DataCollection');
    if (!dataCollection) throw new Error('Save did not include the DataCollection settings');
    expect((dataCollection.body.modules as Record<string, unknown>).in_app_activity_class).toMatchObject({
      enabled: true,
      required: true,
    });
    store.dispatch(studyOperationsApi.util.resetApiState());
  },
);

describe('study lifecycle action visibility', () => {
  test.each([
    ['2020-01-01T00:00:00Z', true],
    ['2099-01-01T00:00:00Z', false],
    [null, false],
  ])('shows the retention banner only after expiry: %s', async (studyDataExpires, expired) => {
    window.location.href = 'http://localhost/';
    globalThis.fetch = routeFetch({
      'GET /chronicle/api/web/limits/study/retention': () => Response.json({ studyDataExpires }),
      'GET /chronicle/api/web/study/retention/lifecycle': () => Response.json('ACTIVE'),
      'GET /chronicle/api/web/study/retention': () =>
        Response.json({ id: 'retention', title: 'Retention study', modules: {} }),
    });
    const store = createApiStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/studies/retention']}>
          <Routes>
            <Route element={<StudyLayout />} path="/studies/:studyId" />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    await waitFor(() =>
      expect(studyOperationsApi.endpoints.getStudyLimits.select('retention')(store.getState()).isSuccess).toBe(true),
    );
    expect(screen.queryByText('Retention period ended — delete the study.') !== null).toBe(expired);
    store.dispatch(studyOperationsApi.util.resetApiState());
  });

  test('hides every management action while lifecycle status is unavailable', () => {
    expect(getStudyLifecycleActionVisibility(undefined)).toEqual(hiddenActions);
    expect(getStudyLifecycleActionVisibility(null)).toEqual(hiddenActions);
  });

  test('fails closed for an unrecognized runtime status', () => {
    expect(getStudyLifecycleActionVisibility('FUTURE_STATUS' as StudyLifecycleStatus)).toEqual(hiddenActions);
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
    globalThis.fetch = routeFetch({
      'GET /chronicle/api/web/study/cached-active/lifecycle': () => Response.json(lifecycleStatus),
      'POST /chronicle/api/web/study/cached-active/archive': () => {
        archiveRequests += 1;
        return Response.json({});
      },
      'GET /chronicle/api/web/study/cached-active': () =>
        Response.json(
          {
            description: 'Cached lifecycle regression',
            id: 'cached-active',
            modules: {},
            title: 'Cached Active Study',
          },
          { headers: { etag: '"1"' } },
        ),
      'GET /chronicle/api/web/limits/study/cached-active': () => Response.json(null),
    });
    const store = createApiStore();

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
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive study' }));
    const dialog = await screen.findByRole('dialog');
    const staleConfirmation = within(dialog).getByRole('button', { name: 'Archive study' });

    lifecycleStatus = 'FUTURE_STATUS';
    await act(async () => {
      const refetch = store.dispatch(
        studyOperationsApi.endpoints.getStudyLifecycleStatus.initiate('cached-active', { forceRefetch: true }),
      );
      await refetch;
      refetch.unsubscribe();
    });

    expect(screen.queryByRole('button', { name: 'Study actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit study' })).toBeNull();
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

  test('a study hidden by its pending erasure still offers Cancel deletion and Erase now', async () => {
    window.location.href = 'http://localhost/';
    globalThis.fetch = routeFetch({
      'GET /chronicle/api/web/study/hidden': () => Response.json({ message: 'No study found' }, { status: 404 }),
      'GET /chronicle/api/web/study/hidden/lifecycle': () => Response.json('SCHEDULED_FOR_DELETION'),
      'GET /chronicle/api/web/limits/study/hidden': () => Response.json({ message: 'No study found' }, { status: 404 }),
      'GET /chronicle/api/web/study/hidden/deletions': () =>
        Response.json([
          { operationId: 'op-1', mode: 'STUDY_ERASURE', status: 'QUARANTINED', erasable: true, studyId: 'hidden' },
        ]),
    });
    const store = createApiStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/studies/hidden']}>
          <Routes>
            <Route element={<StudyLayout />} path="/studies/:studyId" />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    expect(await screen.findByRole('button', { name: 'Erase now' })).toBeTruthy();
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Study actions' }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole('menuitem', { name: 'Cancel deletion' })).toBeTruthy();
    store.dispatch(studyOperationsApi.util.resetApiState());
  });

  test('cancels a deletion request through the deletion endpoint instead of unarchive', async () => {
    window.location.href = 'http://localhost/';
    let cancellationRequests = 0;
    let unarchiveRequests = 0;
    globalThis.fetch = routeFetch({
      'GET /chronicle/api/web/study/scheduled/lifecycle': () =>
        new Response(JSON.stringify('SCHEDULED_FOR_DELETION'), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      'POST /chronicle/api/web/study/scheduled/schedule-delete': (request) => {
        const method = request.method;
        cancellationRequests += 1;
        expect(method).toBe('POST');
        return new Response('{}', { headers: { 'content-type': 'application/json' }, status: 200 });
      },
      'POST /chronicle/api/web/study/scheduled/unarchive': () => {
        unarchiveRequests += 1;
        return new Response('{}', { headers: { 'content-type': 'application/json' }, status: 200 });
      },
      'GET /chronicle/api/web/study/scheduled': () =>
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
      'GET /chronicle/api/web/limits/study/scheduled': () => Response.json(null),
    });
    const store = createApiStore();

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
    expect(screen.queryByRole('button', { name: 'Edit study' })).toBeNull();
    fireEvent.pointerDown(actionsTrigger, { button: 0, ctrlKey: false });
    expect(screen.queryByRole('menuitem', { name: 'Delete study' })).toBeNull();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancel deletion' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/restore its previous lifecycle state/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel deletion' }));

    await waitFor(() => expect(cancellationRequests).toBe(1));
    expect(unarchiveRequests).toBe(0);
  });

  test('requests a cancellable deletion with no erase date instead of calling the direct destroy endpoint', async () => {
    window.location.href = 'http://localhost/';
    let scheduleRequests = 0;
    let destroyRequests = 0;
    let requestedQuery = null as string | null; // assigned inside the fetch stub
    globalThis.fetch = routeFetch({
      'GET /chronicle/api/web/study/active/lifecycle': () =>
        new Response(JSON.stringify('ACTIVE'), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      'DELETE /chronicle/api/web/study/active/schedule-delete': (request) => {
        const method = request.method;
        const url = request.url;
        scheduleRequests += 1;
        expect(method).toBe('DELETE');
        requestedQuery = new URL(url).search;
        return new Response('{}', { headers: { 'content-type': 'application/json' }, status: 200 });
      },
      'DELETE /chronicle/api/web/study/active': () => {
        destroyRequests += 1;
        return new Response('[]', { headers: { 'content-type': 'application/json' }, status: 200 });
      },
      'GET /chronicle/api/web/study/active': () =>
        new Response(
          JSON.stringify({
            description: 'Deletion scheduling regression',
            id: 'active',
            modules: {},
            title: 'Active Study',
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      'GET /chronicle/api/web/limits/study/active': () => Response.json(null),
    });
    const store = createApiStore();

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
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete study' }));
    const dialog = await screen.findByRole('dialog');
    const confirmationInput = within(dialog).getByRole('textbox');
    const confirmationTitle = confirmationInput.getAttribute('placeholder');
    expect(confirmationTitle).toBeTruthy();
    fireEvent.change(confirmationInput, { target: { value: confirmationTitle } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Request deletion' }));

    await waitFor(() => expect(scheduleRequests).toBe(1));
    expect(destroyRequests).toBe(0);
    // No date reaches the server: time never starts an erasure.
    expect(requestedQuery).toBe('');
  });
});

test.each([...STUDY_LIFECYCLE_STATUSES])('mutation refusals stay inside lifecycle dialogs for %s', async (status) => {
  const visibility = visibilityFor(status);
  const actions = [
    ...(visibility.showArchive ? ['Archive study'] : []),
    ...(visibility.showRestore ? [status === 'SCHEDULED_FOR_DELETION' ? 'Cancel deletion' : 'Restore study'] : []),
    ...(visibility.showDelete ? ['Delete study'] : []),
  ];
  for (const label of actions) {
    globalThis.fetch = routeFetch({
      'GET /chronicle/api/web/study/dialog-errors': () =>
        Response.json({ id: 'dialog-errors', title: 'Study', modules: {} }, { headers: { etag: '"1"' } }),
      'GET /chronicle/api/web/study/dialog-errors/lifecycle': () => Response.json(status),
      'GET /chronicle/api/web/limits/study/dialog-errors': () => Response.json(null),
      ...Object.fromEntries(
        ['POST archive', 'POST unarchive', 'POST schedule-delete', 'DELETE schedule-delete'].map((operation) => {
          const [method, path] = operation.split(' ');
          return [
            `${method} /chronicle/api/web/study/dialog-errors/${path}`,
            () => Response.json({ message: 'Mutation refused' }, { status: 409 }),
          ];
        }),
      ),
    });
    const store = createApiStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/studies/dialog-errors']}>
          <Routes>
            <Route element={<StudyLayout />} path="/studies/:studyId" />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Study actions' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: label }));
    const dialog = await screen.findByRole('dialog');
    if (label === 'Delete study') {
      // Type the title the dialog asks for: other files' module mocks can change the summary it shows.
      const confirmation = within(dialog).getByRole('textbox');
      fireEvent.change(confirmation, { target: { value: confirmation.getAttribute('placeholder') } });
    }
    fireEvent.click(
      within(dialog).getByRole('button', { name: label === 'Delete study' ? 'Request deletion' : label }),
    );
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Mutation refused');
    expect(screen.getByRole('dialog')).toBe(dialog);
    cleanup();
    store.dispatch(studyOperationsApi.util.resetApiState());
  }
});

test('archive sends the revision the page shows and a conflict shows the server message', async () => {
  window.location.href = 'http://localhost/';
  const ifMatch: (string | null)[] = [];
  const conflict = 'This study changed in another window. Refresh to see its current state.';
  globalThis.fetch = routeFetch({
    'GET /chronicle/api/web/study/revisioned/lifecycle': () => Response.json('ACTIVE'),
    'POST /chronicle/api/web/study/revisioned/archive': (request) => {
      ifMatch.push(request.headers.get('If-Match'));
      return Response.json({ message: conflict }, { status: 412 });
    },
    'GET /chronicle/api/web/study/revisioned': () =>
      Response.json({ id: 'revisioned', modules: {}, title: 'Revisioned Study' }, { headers: { etag: '"9"' } }),
    'GET /chronicle/api/web/limits/study/revisioned': () => Response.json(null),
  });
  const store = createApiStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/studies/revisioned']}>
        <Routes>
          <Route element={<StudyLayout />} path="/studies/:studyId" />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  fireEvent.pointerDown(await screen.findByRole('button', { name: 'Study actions' }), { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive study' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Archive study' }));
  expect((await within(dialog).findByRole('alert')).textContent).toBe(conflict);
  expect(ifMatch).toEqual(['"9"']);
  store.dispatch(studyOperationsApi.util.resetApiState());
});

test.each([
  ['ACTIVE', 'Archive study'],
  ['ARCHIVED', 'Restore study'],
] as const)('%s: %s waits for the study revision instead of sending a blind write', async (status, label) => {
  const writes: string[] = [];
  globalThis.fetch = routeFetch({
    'POST /chronicle/api/web/study/unread/archive': () => {
      writes.push('archive');
      return Response.json({});
    },
    'POST /chronicle/api/web/study/unread/unarchive': () => {
      writes.push('unarchive');
      return Response.json({});
    },
  });
  const store = createApiStore();
  const view = (settingsRevision: string | undefined) => (
    <Provider store={store}>
      <StudyLifecycleActions settingsRevision={settingsRevision} status={status} studyId="unread" title="Unread" />
    </Provider>
  );
  const { rerender } = render(view(undefined));
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Study actions' }), { button: 0, ctrlKey: false });
  const item = await screen.findByRole('menuitem', { name: label });
  expect(item.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(item);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(writes).toEqual([]);
  rerender(view('"4"'));
  await waitFor(() => expect(screen.getByRole('menuitem', { name: label }).getAttribute('aria-disabled')).toBeNull());
  store.dispatch(studyOperationsApi.util.resetApiState());
});

test('Cancel deletion needs no study revision', async () => {
  const store = createApiStore();
  render(
    <Provider store={store}>
      <StudyLifecycleActions status="SCHEDULED_FOR_DELETION" studyId="unread" title="Unread" />
    </Provider>,
  );
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Study actions' }), { button: 0, ctrlKey: false });
  const item = await screen.findByRole('menuitem', { name: 'Cancel deletion' });
  expect(item.getAttribute('aria-disabled')).toBeNull();
  fireEvent.click(item);
  expect(await screen.findByRole('dialog')).toBeTruthy();
  store.dispatch(studyOperationsApi.util.resetApiState());
});
