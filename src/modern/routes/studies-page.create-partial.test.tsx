import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useRef } from 'react';
import { Provider } from 'react-redux';
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation } from 'react-router';
import type { StudyFormDialogProps } from '@/components/study-form/types';
import { StudyNotices } from '@/components/study-notices';
import {
  EDIT_PRECONDITION_HEADER,
  EDIT_REVISION_HEADER,
  STUDY_LIFECYCLE_STATUS,
} from '@/generated/chronicle-contracts';
import { studyFieldName } from '@/lib/study-form-model';
import { studyNavigationActionError, studyNavigationFailedSteps } from '@/lib/study-navigation';
import { STUDY_SAVE_STEPS, StudySaveError } from '@/lib/study-save';
import { SESSION_STATUS, sessionReducer } from '@/state/session-slice';
import { forgetSettingsRevision } from '@/state/settings-revision';
import { studyOperationsApi } from '@/state/study-operations-api';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { moduleDraftsWith } from '@/test/module-drafts';
import { VALID_PARTICIPANT_POLICY } from '@/test/participant-policy';

const realFormModule = await import('@/components/study-form-dialog');
const RealStudyFormDialog = realFormModule.StudyFormDialog;
let faking = true;
const saveFailures: unknown[] = [];
afterAll(() => {
  faking = false;
});
const StudyFormDialog = (props: StudyFormDialogProps) => {
  const context = useRef<Parameters<StudyFormDialogProps['onSubmit']>[1]>({});
  return faking ? (
    <button
      type="button"
      onClick={() =>
        void props
          .onSubmit(
            {
              title: 'Created study',
              contact: 'study@example.org',
              description: '',
              group: '',
              version: '',
              features: ['CHRONICLE_DATA_COLLECTION'],
              modules: moduleDraftsWith(),
              participantPolicy: VALID_PARTICIPANT_POLICY,
              studyDurationDays: '12',
              dataRetentionDays: '24',
            },
            context.current,
          )
          .catch((error: unknown) => {
            saveFailures.push(error);
          })
      }
    >
      Create fixture study
    </button>
  ) : (
    <RealStudyFormDialog {...props} />
  );
};
await mock.module('@/components/study-form-dialog', () => ({
  ...realFormModule,
  StudyFormDialog,
}));
const { StudiesPage } = await import('./studies-page');
const savedFetch = globalThis.fetch;
let restoreRequest: (() => void) | undefined;
let store: ReturnType<typeof createStore> | undefined;
afterEach(() => {
  cleanup();
  store?.dispatch(studyOperationsApi.util.resetApiState());
  globalThis.fetch = savedFetch;
  restoreRequest?.();
  forgetSettingsRevision('created-study');
  saveFailures.length = 0;
});

function createStore() {
  return configureStore({
    reducer: { session: sessionReducer, [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
    preloadedState: {
      session: { ...sessionReducer(undefined, { type: 'init' }), status: SESSION_STATUS.authenticated },
    },
    middleware: (getDefault) => getDefault().concat(studyOperationsApi.middleware),
  });
}

function CreatedStudy() {
  const location = useLocation();
  return (
    <>
      <p>Created study page</p>
      <StudyNotices
        isLifecycleFetching={false}
        status={STUDY_LIFECYCLE_STATUS.ACTIVE}
        studyDataExpires={undefined}
        actionError={studyNavigationActionError(location.state)}
        createFailedSteps={studyNavigationFailedSteps(location.state)}
      />
    </>
  );
}

function renderCreate(failSetting?: string, { failedReads = 0, heldSetting = '' } = {}) {
  restoreRequest = installRelativeRequest();
  const calls: string[] = [];
  let revision = 0;
  let outstanding = false;
  let overlapped = false;
  let creates = 0;
  let failing = failSetting;
  let readsToFail = failedReads;
  const held = Promise.withResolvers<void>();
  // The created study as the server stores it, so a reload shows what was really committed.
  let details: Record<string, unknown> = {};
  let settings: Record<string, unknown> = {};
  let limits: unknown = {};
  const etag = () => JSON.stringify(String(revision));
  const write = async (request: Request, name: string) => {
    calls.push(name);
    if (outstanding) overlapped = true;
    outstanding = true;
    if (name === heldSetting) {
      heldSetting = '';
      await held.promise;
    }
    await Promise.resolve();
    try {
      const ifMatch = request.headers.get(EDIT_PRECONDITION_HEADER);
      if (!ifMatch) return Response.json({}, { status: 428 });
      if (ifMatch !== etag()) return Response.json({}, { status: 412 });
      if (name === failing) return Response.json({ message: 'Configuration unavailable' }, { status: 503 });
      const body: unknown = await request.json();
      switch (name) {
        case 'details':
          details = { ...details, ...(body as Record<string, unknown>) };
          break;
        case 'limits':
          limits = body;
          break;
        default:
          settings = { ...settings, [name]: body };
      }
      revision++;
      return Response.json(null, { headers: { [EDIT_REVISION_HEADER]: etag() } });
    } finally {
      outstanding = false;
    }
  };
  const settingTypes = STUDY_SAVE_STEPS.filter((step) => step !== 'details' && step !== 'limits');
  globalThis.fetch = routeFetch({
    'GET /chronicle/api/web/study': () => Response.json([]),
    'POST /chronicle/api/web/study': async (request: Request) => {
      creates++;
      const { settings: created, ...study } = (await request.json()) as Record<string, unknown>;
      details = study;
      settings = { ...(created as Record<string, unknown>) };
      return Response.json('created-study');
    },
    'PATCH /chronicle/api/web/study/created-study': (request: Request) => write(request, 'details'),
    'GET /chronicle/api/web/study/created-study': () => {
      calls.push('read');
      if (readsToFail > 0) {
        readsToFail--;
        return Response.json({ message: 'Study unavailable' }, { status: 503 });
      }
      return Response.json(
        { id: 'created-study', ...details, settings },
        { headers: { [EDIT_REVISION_HEADER]: etag() } },
      );
    },
    'GET /chronicle/api/web/study/created-study/settings': () =>
      Response.json(settings, { headers: { [EDIT_REVISION_HEADER]: etag() } }),
    'GET /chronicle/api/web/study/created-study/settings/locks': () => Response.json([]),
    'GET /chronicle/api/web/limits/study/created-study': () => Response.json(limits),
    ...Object.fromEntries(
      settingTypes.map((setting) => [
        `PATCH /chronicle/api/web/study/created-study/settings/type/${setting}`,
        (request: Request) => write(request, setting),
      ]),
    ),
    'PUT /chronicle/api/web/limits/study/created-study': (request: Request) => write(request, 'limits'),
  });
  store = createStore();
  const router = createMemoryRouter(
    [
      { path: '/studies', element: <StudiesPage /> },
      { path: '/studies/:studyId', element: <CreatedStudy /> },
      { path: '/away', element: <p>Away</p> },
    ],
    { initialEntries: ['/studies'] },
  );
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  if (faking) fireEvent.click(screen.getAllByRole('button', { name: 'Create fixture study' })[0] as HTMLElement);
  return {
    router,
    calls,
    resume: () => held.resolve(),
    overlapped: () => overlapped,
    creates: () => creates,
    failDetails: () => {
      failing = 'details';
    },
    recover: () => {
      failing = undefined;
    },
    // Another tab commits an edit to the created study.
    competingSave: () => {
      details = { ...details, title: 'Edited in another tab' };
      revision++;
    },
  };
}

const studyName = () => screen.getByLabelText<HTMLInputElement>(/^Study name/);
const submitRealDialog = () => fireEvent.submit(studyName().closest('form') as HTMLFormElement);

function fillParticipantPolicy() {
  for (const [field, value] of Object.entries(VALID_PARTICIPANT_POLICY)) {
    fireEvent.change(document.getElementsByName(studyFieldName.policy(field))[0] as HTMLElement, {
      target: { value },
    });
  }
}

/** Opens the real create dialog, enters a valid draft and submits it. */
function createWithRealDialog(submits = 1) {
  fireEvent.click(screen.getAllByRole('button', { name: 'Create new study' })[0] as HTMLElement);
  fireEvent.change(studyName(), { target: { value: 'Pilot draft' } });
  fireEvent.change(screen.getByLabelText(/^Contact email/), { target: { value: 'study@example.org' } });
  fillParticipantPolicy();
  act(() => {
    for (let index = 0; index < submits; index++) submitRealDialog();
  });
}

test('reads the created revision and serializes settings and limits under each committed ETag', async () => {
  const server = renderCreate();
  await screen.findByText('Created study page');
  expect(server.calls[0]).toBe('read');
  expect(server.calls.filter((call) => call !== 'read').at(-1)).toBe('limits');
  expect(server.overlapped()).toBe(false);
  expect(screen.queryByText(/these settings did not save/)).toBeNull();
});

test('a partial create retains its draft, reports failure and retries the same created study', async () => {
  const server = renderCreate('TimeUseDiary');
  await waitFor(() => expect(saveFailures).toHaveLength(1));
  expect(screen.queryByText('Created study page')).toBeNull();
  expect(String(saveFailures[0])).toContain('Configuration unavailable');
  expect(server.calls.filter((call) => call !== 'read').at(-1)).toBe('limits');
  expect(server.overlapped()).toBe(false);
  server.recover();
  fireEvent.click(screen.getAllByRole('button', { name: 'Create fixture study' })[0] as HTMLElement);
  await screen.findByText('Created study page');
  expect(server.creates()).toBe(1);
});

test('a failed details retry reports details and stops later settings writes', async () => {
  const server = renderCreate('TimeUseDiary');
  await waitFor(() => expect(saveFailures).toHaveLength(1));
  server.failDetails();
  const before = server.calls.length;
  fireEvent.click(screen.getAllByRole('button', { name: 'Create fixture study' })[0] as HTMLElement);
  await waitFor(() => expect(saveFailures).toHaveLength(2));
  expect(server.calls.slice(before).filter((call) => call !== 'read')).toEqual(['details']);
  expect(String(saveFailures[1])).toContain('study details');
  expect(server.creates()).toBe(1);
});

test('a retry after another tab saved the created study conflicts instead of overwriting it', async () => {
  const server = renderCreate('TimeUseDiary');
  await waitFor(() => expect(saveFailures).toHaveLength(1));
  server.recover();
  server.competingSave();
  const before = server.calls.length;
  fireEvent.click(screen.getAllByRole('button', { name: 'Create fixture study' })[0] as HTMLElement);
  await waitFor(() => expect(saveFailures).toHaveLength(2));
  // The retry writes with this tab's last committed revision: no re-read first, one rejected write, no
  // later write (the read after it is the cache refresh the details write invalidates).
  expect(server.calls[before]).toBe('details');
  expect(server.calls.slice(before).filter((call) => call !== 'read')).toEqual(['details']);
  expect(saveFailures[1]).toBeInstanceOf(StudySaveError);
  expect((saveFailures[1] as StudySaveError).conflicts).toContainEqual({ type: 'settingsRevision' });
  expect(screen.queryByText('Created study page')).toBeNull();
  expect(server.creates()).toBe(1);
});

test('a retry after the created revision could not be read reads it and saves the same study', async () => {
  const server = renderCreate(undefined, { failedReads: 1 });
  await waitFor(() => expect(saveFailures).toHaveLength(1));
  expect(server.calls).toEqual(['read']);
  fireEvent.click(screen.getAllByRole('button', { name: 'Create fixture study' })[0] as HTMLElement);
  await screen.findByText('Created study page');
  expect(server.calls.filter((call) => call !== 'read').at(-1)).toBe('limits');
  expect(server.creates()).toBe(1);
});

test('a stale create retry keeps the real dialog draft and shows the revision conflict', async () => {
  faking = false;
  try {
    const server = renderCreate('TimeUseDiary');
    createWithRealDialog();
    await screen.findByText(/Configuration unavailable/);
    server.recover();
    server.competingSave();
    submitRealDialog();
    await screen.findByText(/Study settings were changed by someone else/);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(studyName().value).toBe('Pilot draft');
    expect(screen.queryByText('Created study page')).toBeNull();
    expect(server.creates()).toBe(1);
  } finally {
    faking = true;
  }
});

test('reloading after a create conflict edits the created study and saves it without a second create', async () => {
  faking = false;
  try {
    const server = renderCreate('TimeUseDiary');
    createWithRealDialog();
    await screen.findByText(/Configuration unavailable/);
    server.recover();
    server.competingSave();
    submitRealDialog();
    await screen.findByText(/Study settings were changed by someone else/);
    expect(server.creates()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft and reload latest' }));
    const confirm = screen.getAllByRole('dialog').at(-1) as HTMLElement;
    fireEvent.click(within(confirm).getByRole('button', { name: 'Discard draft and reload latest' }));
    // The form now shows the created study as the server holds it, including the other tab's edit.
    await waitFor(() => expect(studyName().value).toBe('Edited in another tab'));
    submitRealDialog();
    await screen.findByText('Created study page');
    expect(server.creates()).toBe(1);
  } finally {
    faking = true;
  }
});

test('closing after a partial create reopens the created study instead of creating a second one', async () => {
  faking = false;
  try {
    const server = renderCreate('TimeUseDiary');
    createWithRealDialog();
    await screen.findByText(/Configuration unavailable/);
    server.recover();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getAllByRole('button', { name: 'Create new study' })[0] as HTMLElement);
    await waitFor(() => expect(studyName().value).toBe('Pilot draft'));
    submitRealDialog();
    await screen.findByText('Created study page');
    expect(server.creates()).toBe(1);
  } finally {
    faking = true;
  }
});

test('going back after a completed create starts a new study instead of editing the created one', async () => {
  faking = false;
  try {
    const server = renderCreate();
    createWithRealDialog();
    await screen.findByText('Created study page');
    await act(() => server.router.navigate(-1));
    expect(server.router.state.location.search).toBe('');
    createWithRealDialog();
    await screen.findByText('Created study page');
    expect(server.creates()).toBe(2);
  } finally {
    faking = true;
  }
});

test('a new study draft survives a reconnect that populates the empty catalog', async () => {
  faking = false;
  restoreRequest = installRelativeRequest();
  let populated = false;
  globalThis.fetch = routeFetch({
    'GET /chronicle/api/web/study': () =>
      Response.json(populated ? [{ id: 'other-study', title: 'Other study', modules: {} }] : []),
  });
  store = createStore();
  try {
    render(
      <Provider store={store}>
        <MemoryRouter>
          <StudiesPage />
        </MemoryRouter>
      </Provider>,
    );
    await screen.findByText('No studies found');
    // Header trigger plus the empty-catalog button: one mounted editor, no second trigger.
    expect(screen.getAllByRole('button', { name: 'Create new study' })).toHaveLength(2);
    const emptyCatalogCreate = within(
      screen.getByText('No studies found').closest('[role="status"]') as HTMLElement,
    ).getByRole('button', { name: 'Create new study' });
    fireEvent.click(emptyCatalogCreate);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText(/^Study name/), { target: { value: 'Pilot draft' } });
    populated = true;
    await act(async () => {
      const refetch = store?.dispatch(
        studyOperationsApi.endpoints.getAllStudies.initiate(undefined, { forceRefetch: true }),
      );
      await refetch;
      refetch?.unsubscribe();
    });
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(screen.getByLabelText<HTMLInputElement>(/^Study name/).value).toBe('Pilot draft');
  } finally {
    faking = true;
  }
});

test('returning after navigation resumes the partially created study with its freshly read revision', async () => {
  faking = false;
  try {
    const server = renderCreate('TimeUseDiary');
    createWithRealDialog();
    await screen.findByText(/Configuration unavailable/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search studies' }), { target: { value: 'Pilot' } });
    await waitFor(() => expect(server.router.state.location.search).toContain('Pilot'));
    await act(() => server.router.navigate('/away'));
    server.recover();
    server.competingSave();
    await act(() => server.router.navigate(-1));
    fireEvent.click(screen.getAllByRole('button', { name: 'Create new study' })[0] as HTMLElement);
    await waitFor(() => expect(studyName().value).toBe('Edited in another tab'));
    // A second writer after recovery still conflicts with the exact snapshot on screen.
    server.competingSave();
    submitRealDialog();
    await screen.findByText(/Study settings were changed by someone else/);
    expect(server.creates()).toBe(1);
  } finally {
    faking = true;
  }
});

test('a real dialog retries a failed first revision read and fences same-turn submits', async () => {
  faking = false;
  try {
    const server = renderCreate(undefined, { failedReads: 1 });
    createWithRealDialog();
    await screen.findByText(/Study unavailable/);
    expect(studyName().value).toBe('Pilot draft');
    act(() => {
      submitRealDialog();
      submitRealDialog();
    });
    await screen.findByText('Created study page');
    expect(server.creates()).toBe(1);
    expect(server.overlapped()).toBe(false);
  } finally {
    faking = true;
  }
});

test('same-turn initial submits create exactly one study', async () => {
  faking = false;
  try {
    const server = renderCreate();
    createWithRealDialog(2);
    await screen.findByText('Created study page');
    expect(server.creates()).toBe(1);
    expect(server.overlapped()).toBe(false);
  } finally {
    faking = true;
  }
});

test('returning while the first settings save is still pending cannot create a second study', async () => {
  faking = false;
  const server = renderCreate(undefined, { heldSetting: 'TimeUseDiary' });
  try {
    createWithRealDialog();
    await waitFor(() => expect(server.calls).toContain('TimeUseDiary'));
    await act(() => server.router.navigate('/away'));
    await act(() => server.router.navigate(-1));
    fireEvent.click(screen.getAllByRole('button', { name: 'Create new study' })[0] as HTMLElement);
    await waitFor(() => expect(studyName().value).toBe('Pilot draft'));
    fillParticipantPolicy();
    submitRealDialog();
    await screen.findByText('Created study page');
    expect(server.creates()).toBe(1);
  } finally {
    await act(async () => {
      server.resume();
      await Promise.resolve();
    });
    faking = true;
  }
});

// The researcher's study list: each study names its features, and the contact and last-update columns sort the list
// (newest first on the second click), so a study someone just changed is found without reading every row.
test('the studies list names each study feature and sorts by contact and by last update', async () => {
  restoreRequest = installRelativeRequest();
  globalThis.fetch = routeFetch({
    'GET /chronicle/api/web/study': () =>
      Response.json([
        {
          id: 'study-a',
          title: 'Alpha pilot',
          contact: 'zoe@example.org',
          updatedAt: '2026-10-01T12:00:00Z',
          modules: { CHRONICLE_DATA_COLLECTION: {}, TIME_USE_DIARY: {} },
        },
        {
          id: 'study-b',
          title: 'Beta pilot',
          contact: 'ana@example.org',
          updatedAt: '2026-10-20T12:00:00Z',
          modules: {},
        },
      ]),
  });
  store = createStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/studies']}>
        <StudiesPage />
      </MemoryRouter>
    </Provider>,
  );
  const titles = () =>
    screen.getAllByRole('link').flatMap((link) => (link.textContent?.endsWith(' pilot') ? [link.textContent] : []));
  await screen.findByText('Alpha pilot');
  expect(titles()).toEqual(['Alpha pilot', 'Beta pilot']);
  const alphaRow = screen.getByText('Alpha pilot').closest('tr') as HTMLElement;
  expect(within(alphaRow).getByText('Data collection')).toBeTruthy();
  expect(within(alphaRow).getByText('Time use diary')).toBeTruthy();
  expect(within(screen.getByText('Beta pilot').closest('tr') as HTMLElement).getByText('No modules')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: /Contact/ }));
  expect(titles()).toEqual(['Beta pilot', 'Alpha pilot']);
  fireEvent.click(screen.getByRole('button', { name: /Updated/ }));
  expect(titles()).toEqual(['Alpha pilot', 'Beta pilot']);
  fireEvent.click(screen.getByRole('button', { name: /Updated/ }));
  expect(titles()).toEqual(['Beta pilot', 'Alpha pilot']);
});
