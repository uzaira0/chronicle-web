import { afterEach, expect, mock, test } from 'bun:test';
import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { SessionBootstrap } from '@/app/session-bootstrap';
import { AUTH_DASHBOARD_LOGIN_ENDPOINT } from '@/lib/auth-endpoints';
import { STUDY_SAVE_STEPS } from '@/lib/study-save';
import { UnsavedEditsGuard } from '@/lib/use-confirm-leave';
import { bootstrapSession, expireSession, logoutSession, SESSION_STATUS } from '@/state/session-slice';
import { forgetSettingsRevision, knownSettingsRevision } from '@/state/settings-revision';
import { store as dashboardStore } from '@/state/store';
import { studyOperationsApi } from '@/state/study-operations-api';
import { leaveIsBlocked } from '@/test/browser-env';
import type { FetchRoutes } from '@/test/http-fixtures';
import { routeFetch } from '@/test/http-fixtures';
import { StudyLayout } from './study-layout';

async function confirmCancelPending(trigger: HTMLElement) {
  fireEvent.click(trigger);
  const [confirm] = (await screen.findAllByRole('button', { name: 'Revoke enrollment code' })).slice(-1);
  fireEvent.click(confirm as HTMLElement);
}

const STUDY_ID = 'conflict-study';
const PENDING_PARTICIPANTS = { first: 'pending-1', second: 'pending-2' } as const;
const savedFetch = globalThis.fetch;
const savedConfirmDescriptor = Object.getOwnPropertyDescriptor(window, 'confirm');

const POLICY = {
  '@class': 'com.openlattice.chronicle.study.StudyParticipantPolicy',
  responsibleInstitution: 'Example Research Institute',
  serverOperator: 'Example Hosting Cooperative',
  researchContact: 'study-team@example.org',
  purpose: 'Understand how daily routines relate to health.',
  expectedDuration: 'Twelve weeks',
  procedures: 'The app collects only the modules the participant approves.',
  foreseeableRisks: 'Collected data may reveal sensitive daily patterns.',
  expectedBenefits: 'There may be no direct benefit to participants.',
  dataUseAndSharing: 'Approved researchers receive coded study data.',
  retentionAndDeletion: 'Data is retained for seven years, then deleted.',
  privacyPolicyUrl: 'https://research.example.org/privacy/study-a',
  withdrawalUrl: 'https://research.example.org/withdraw/study-a',
  version: 'policy-v1',
  effectiveAt: '2026-08-17T09:30:00-05:00',
};

const LIMITS = {
  dataRetentionDuration: { days: 0, months: 3, years: 0 },
  studyDuration: { days: 0, months: 0, years: 1 },
  studyEnds: '2026-10-20T09:00:00-05:00',
  studyDataExpires: '2027-01-20T09:00:00-06:00',
};

function json(body: unknown, init: { etag?: string; status?: number } = {}): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.etag) headers.etag = init.etag;
  return new Response(JSON.stringify(body), { headers, status: init.status ?? 200 });
}

afterEach(() => {
  cleanup();
  if (savedConfirmDescriptor) Object.defineProperty(window, 'confirm', savedConfirmDescriptor);
  else Reflect.deleteProperty(window, 'confirm');
  dashboardStore.dispatch(studyOperationsApi.util.resetApiState());
  dashboardStore.dispatch(logoutSession.fulfilled(undefined, 'test-reset', undefined));
  forgetSettingsRevision(STUDY_ID);
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
});

function createStudyServer() {
  const server = {
    sessionExpired: false,
    features: { CHRONICLE_DATA_COLLECTION: {} } as Record<string, unknown>,
    storedCollection: undefined as Record<string, unknown> | undefined,
    revision: 1,
    readRevision: undefined as number | undefined,
    afterWrite: null as (() => Promise<void>) | null,
    limitsFails: false,
    pendingEnrollment: false,
    participantPolicyFails: false,
    omitRevision: false,
    blockingParticipantIds: [PENDING_PARTICIPANTS.first] as string[],
    cancellations: [] as string[],
    limitsPuts: [] as Record<string, unknown>[],
    limitsIfMatch: [] as (string | null)[],
    patches: [] as { ifMatch: string | null; settingType: string; body: Record<string, unknown> }[],
    detailsPatches: [] as { ifMatch: string | null; revision: number; body: Record<string, unknown> }[],
  };
  return server;
}

type StudyServer = ReturnType<typeof createStudyServer>;

async function patchStudySettings(server: StudyServer, request: Request, settingType: string) {
  const etag = `"${server.revision}"`;

  const ifMatch = request.headers.get('If-Match');
  server.patches.push({
    body: (await request.json()) as Record<string, unknown>,
    ifMatch,
    settingType: settingType,
  });
  if (server.participantPolicyFails && settingType === 'ParticipantPolicy')
    return new Response('Participant policy store unavailable', { status: 500 });
  if (server.pendingEnrollment && settingType === 'DataCollection')
    return json(
      {
        blockingParticipantIds: server.blockingParticipantIds,
        message:
          'Enrollment is pending for ' +
          server.blockingParticipantIds.join(', ') +
          '. Wait for the device to finish, or cancel the pending enrollment.',
      },
      { status: 409 },
    );
  if (ifMatch !== etag) return json({ title: 'settings_conflict' }, { status: 412 });
  server.revision += 1;
  return json({}, { etag: `"${server.revision}"` });
}

async function putStudyLimits(server: StudyServer, request: Request) {
  const etag = `"${server.revision}"`;

  server.limitsPuts.push((await request.clone().json()) as Record<string, unknown>);
  server.limitsIfMatch.push(request.headers.get('If-Match'));
  if (server.limitsFails) return new Response('limits store down', { status: 500 });
  if (request.headers.get('If-Match') !== etag) return json({}, { status: 412 });
  server.revision += 1;
  return json(LIMITS, { etag: `"${server.revision}"` });
}

async function patchStudyDetails(server: StudyServer, request: Request) {
  const etag = `"${server.revision}"`;

  server.detailsPatches.push({
    ifMatch: request.headers.get('If-Match'),
    revision: server.revision,
    body: (await request.json()) as Record<string, unknown>,
  });
  if (request.headers.get('If-Match') !== etag) return json({}, { status: 412 });
  server.revision += 1;
  return json({ id: STUDY_ID, title: 'Conflict Study' }, { etag: `"${server.revision}"` });
}

function studySessionPayload() {
  return {
    ...dashboardStore.getState().session,
    csrfToken: 'test-csrf',
    expiresAt: null,
    status: SESSION_STATUS.authenticated,
    tokenSource: 'dashboard-login' as const,
    user: { id: 'researcher', name: 'Researcher', email: null, roles: [] },
  };
}

function installStudyFetch(server: StudyServer, sessionPayload: ReturnType<typeof studySessionPayload>) {
  window.location.href = 'http://localhost/';
  const studyPath = `/chronicle/api/web/study/${STUDY_ID}`;
  const revision = () => server.readRevision ?? server.revision;
  const readEtag = () => (server.omitRevision ? {} : { etag: `"${revision()}"` });
  const settingsResponse = (body: unknown) => json(body, readEtag());
  const defaultCollectionSetting = () => ({
    modules: revision() >= 2 ? { future_module: { enabled: true, marker: 'from-revision-2' } } : {},
  });
  const routes: FetchRoutes = {
    [`GET ${studyPath}/settings/locks`]: () => json([]),
    [`GET ${studyPath}/lifecycle`]: () => json('ACTIVE'),
    [`GET /chronicle/api/web/limits/study/${STUDY_ID}`]: () => json(LIMITS),
    [`PUT /chronicle/api/web/limits/study/${STUDY_ID}`]: (request) => putStudyLimits(server, request),
    [`GET ${studyPath}/settings/type/DataCollection`]: () => settingsResponse(defaultCollectionSetting()),
    [`GET ${studyPath}/settings`]: () =>
      settingsResponse({ ParticipantPolicy: { ...POLICY, version: `policy-v${revision()}` } }),
    [`GET ${studyPath}`]: () =>
      json(
        {
          contact: 'study-team@example.org',
          id: STUDY_ID,
          modules: server.features,
          settings: { DataCollection: server.storedCollection ?? defaultCollectionSetting() },
          title: 'Conflict Study',
        },
        readEtag(),
      ),
    [`PATCH ${studyPath}`]: (request) => patchStudyDetails(server, request),
    ...Object.fromEntries(
      STUDY_SAVE_STEPS.filter((step) => !['details', 'limits'].includes(step)).map((settingType) => [
        `PATCH ${studyPath}/settings/type/${settingType}`,
        (request: Request) => patchStudySettings(server, request, settingType),
      ]),
    ),
    ...Object.fromEntries(
      Object.values(PENDING_PARTICIPANTS).map((participantId) => [
        `POST ${studyPath}/participant/${participantId}/pending-enrollment/cancel`,
        () => {
          server.cancellations.push(participantId);
          server.blockingParticipantIds = server.blockingParticipantIds.filter((id) => id !== participantId);
          server.pendingEnrollment = server.blockingParticipantIds.length > 0;
          return new Response(null, { status: 204 });
        },
      ]),
    ),
  };
  globalThis.fetch = routeFetch({
    ...Object.fromEntries(
      Object.entries(routes).map(([key, handler]) => [
        key,
        (request: Request) =>
          server.sessionExpired ? json({ message: 'Session expired' }, { status: 401 }) : handler(request),
      ]),
    ),
    [`POST ${AUTH_DASHBOARD_LOGIN_ENDPOINT}`]: () => {
      server.sessionExpired = false;
      return json({ ...sessionPayload, authenticated: true });
    },
  });
}

function pauseStudyWrites(server: StudyServer): Middleware {
  const pauseWrites: Middleware = () => (next) => (action) => {
    const result = next(action) as
      | { arg?: { endpointName?: string }; reset?: () => void; unwrap?: () => Promise<unknown> }
      | undefined;
    if (
      result?.reset &&
      result.unwrap &&
      ['updateStudySettings', 'updateStudy', 'setStudyLimits'].includes(result.arg?.endpointName ?? '')
    ) {
      const unwrap = result.unwrap;
      result.unwrap = async () => {
        const data = await unwrap();
        await server.afterWrite?.();
        return data;
      };
    }
    return result;
  };
  return pauseWrites;
}

function renderStudyWithServer(withSessionGate = false, setup?: (server: StudyServer) => void) {
  const sessionPayload = studySessionPayload();
  const server = createStudyServer();
  setup?.(server);
  installStudyFetch(server, sessionPayload);
  const store = withSessionGate
    ? dashboardStore
    : configureStore({
        middleware: (getDefault) =>
          getDefault().prepend(pauseStudyWrites(server)).concat(studyOperationsApi.middleware),
        reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
      });

  if (withSessionGate) store.dispatch(bootstrapSession.fulfilled(sessionPayload, 'session-test', undefined));
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <UnsavedEditsGuard />
            {withSessionGate ? (
              <SessionBootstrap>
                <Outlet />
              </SessionBootstrap>
            ) : (
              <Outlet />
            )}
          </>
        ),
        children: [
          { element: <StudyLayout />, path: '/studies/:studyId' },
          { element: <p>Other page</p>, path: '/other' },
        ],
      },
    ],
    { initialEntries: ['/other', `/studies/${STUDY_ID}`] },
  );

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );

  return { server, store, router };
}

async function openEditDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Edit study' }));
  const dialog = await screen.findByRole('dialog');
  const policyVersion = () => within(dialog).getByLabelText<HTMLInputElement>(/^Policy version/);
  await waitFor(() => expect(policyVersion().value).toBe('policy-v1'));
  const save = () => fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
  return { dialog, policyVersion, save };
}

test('pending enrollment conflict keeps the draft, shows blockers in the body, and offers cancellation', async () => {
  const { server } = renderStudyWithServer();
  const { dialog, policyVersion, save } = await openEditDialog();
  const draft = 'draft-policy-after-conflict';
  fireEvent.change(policyVersion(), { target: { value: draft } });
  server.pendingEnrollment = true;
  save();
  expect(await within(dialog).findByText(/Enrollment is pending/)).toBeTruthy();
  expect(within(dialog).getByText(/These changes did not save: study details/)).toBeTruthy();
  const participantId = within(dialog).getByText(PENDING_PARTICIPANTS.first, { exact: true });
  expect(policyVersion().value).toBe(draft);
  expect(within(dialog).getByRole('button', { name: 'Save changes' }).parentElement?.contains(participantId)).toBe(
    false,
  );
  await confirmCancelPending(within(dialog).getByRole('button', { name: 'Cancel pending enrollment' }));
  await waitFor(() => expect(server.cancellations).toHaveLength(1));
  await waitFor(() => expect(within(dialog).queryByRole('button', { name: 'Cancel pending enrollment' })).toBeNull());
  expect(policyVersion().value).toBe(draft);
  const patchesBeforeRetry = server.patches.length;
  save();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    server.patches.slice(patchesBeforeRetry).find((patch) => patch.settingType === 'ParticipantPolicy')?.body.version,
  ).toBe(draft);
});

test('collects failures and blockers when an ordinary write fails before a later enrollment conflict', async () => {
  const { server } = renderStudyWithServer();
  const { dialog, policyVersion, save } = await openEditDialog();
  fireEvent.change(policyVersion(), { target: { value: 'draft-policy' } });
  server.participantPolicyFails = true;
  server.pendingEnrollment = true;
  save();

  expect(
    await within(dialog).findByText(/These changes did not save: participant policy, study details\./),
  ).toBeTruthy();
  expect(within(dialog).getByText(PENDING_PARTICIPANTS.first, { exact: true })).toBeTruthy();
  await confirmCancelPending(within(dialog).getByRole('button', { name: 'Cancel pending enrollment' }));
  await waitFor(() => expect(within(dialog).queryByText(/Enrollment is pending/)).toBeNull());
  expect(within(dialog).getByText(/These changes did not save: participant policy, study details\./)).toBeTruthy();
});

test('partial cancellation leaves only the current blocker in the panel and its message', async () => {
  const { server } = renderStudyWithServer();
  const { dialog, save } = await openEditDialog();
  server.blockingParticipantIds = [PENDING_PARTICIPANTS.first, PENDING_PARTICIPANTS.second];
  server.pendingEnrollment = true;
  save();
  await within(dialog).findByText(/Enrollment is pending/);

  const row = within(dialog).getByText(PENDING_PARTICIPANTS.first, { exact: true }).closest('li');
  if (!row) throw new Error('Missing blocker row');
  await confirmCancelPending(within(row).getByRole('button', { name: 'Cancel pending enrollment' }));

  await waitFor(() => expect(server.cancellations).toEqual([PENDING_PARTICIPANTS.first]));
  await waitFor(() => expect(dialog.textContent).not.toContain(PENDING_PARTICIPANTS.first));
  expect(within(dialog).getByText(PENDING_PARTICIPANTS.second, { exact: true })).toBeTruthy();
  expect(within(dialog).getAllByRole('button', { name: 'Cancel pending enrollment' })).toHaveLength(1);
  expect(within(dialog).getAllByRole('alert')).toHaveLength(2);
});

test('clears the conflict after concurrent cancellation of every pending participant', async () => {
  const { server } = renderStudyWithServer();
  const { dialog, save } = await openEditDialog();
  server.blockingParticipantIds = [PENDING_PARTICIPANTS.first, PENDING_PARTICIPANTS.second];
  server.pendingEnrollment = true;
  save();
  await within(dialog).findByText(/Enrollment is pending/);

  for (const button of within(dialog).getAllByRole('button', { name: 'Cancel pending enrollment' }))
    await confirmCancelPending(button);

  await waitFor(() => expect(server.cancellations).toHaveLength(2));
  await waitFor(() => expect(within(dialog).queryByText(/Enrollment is pending/)).toBeNull());
  expect(within(dialog).getByText(/These changes did not save: study details/)).toBeTruthy();
  expect(within(dialog).queryAllByRole('alert')).toHaveLength(1);
});

test('a locked dirty study still protects unload and Back until reauthentication and save', async () => {
  const { server, router } = renderStudyWithServer(true);
  const { policyVersion, save } = await openEditDialog();
  const confirmLeave = mock(() => false);
  window.confirm = confirmLeave;
  fireEvent.change(policyVersion(), { target: { value: 'locked-draft' } });
  expect(leaveIsBlocked()).toBe(true);
  await act(() => dashboardStore.dispatch(expireSession()));
  const password = await screen.findByLabelText(/dashboard password/i);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(leaveIsBlocked()).toBe(true);
  await act(async () => {
    await router.navigate(-1);
  });
  await waitFor(() => expect(confirmLeave).toHaveBeenCalledTimes(1));
  expect(router.state.location.pathname).toBe(`/studies/${STUDY_ID}`);
  fireEvent.change(password, { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
  await screen.findByRole('dialog');
  expect(policyVersion().value).toBe('locked-draft');
  expect(leaveIsBlocked()).toBe(true);
  save();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(server.patches.find(({ settingType }) => settingType === 'ParticipantPolicy')?.body.version).toBe(
    'locked-draft',
  );
  expect(leaveIsBlocked()).toBe(false);
  await act(async () => {
    await router.navigate(-1);
  });
  expect(router.state.location.pathname).toBe('/other');
  expect(confirmLeave).toHaveBeenCalledTimes(1);
});

test('a dirty study form survives a save 401 and password reauthentication', async () => {
  const { server } = renderStudyWithServer(true);
  const { dialog, policyVersion, save } = await openEditDialog();
  fireEvent.change(policyVersion(), { target: { value: 'unsaved-policy' } });
  fireEvent.change(within(dialog).getByLabelText('Data retention (days)'), { target: { value: '12' } });
  server.sessionExpired = true;
  save();
  const password = await screen.findByLabelText(/dashboard password/i);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(within(dialog).getByLabelText<HTMLInputElement>(/^Policy version/).value).toBe('unsaved-policy');
  expect(within(dialog).getByLabelText<HTMLInputElement>('Data retention (days)').value).toBe('12');
  fireEvent.change(password, { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
  await waitFor(() => expect(server.limitsPuts).toHaveLength(1));
  expect(server.patches.find((patch) => patch.settingType === 'ParticipantPolicy')?.body.version).toBe(
    'unsaved-policy',
  );
  expect(server.limitsPuts[0]?.dataRetentionDuration).toEqual({ years: 0, months: 0, days: 12 });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

// Reads that arrive without a revision (a proxy that drops the ETag) leave nothing to make a write conditional on:
// the save stops before any write and asks for a reload, so it can never overwrite another researcher's edit.
test('a study loaded without a revision saves nothing and asks for a reload', async () => {
  const { server } = renderStudyWithServer(false, (setup) => {
    setup.omitRevision = true;
  });
  const { dialog, save } = await openEditDialog();
  fireEvent.change(within(dialog).getByLabelText(/^Study name/), { target: { value: 'Renamed Study' } });
  save();
  await within(dialog).findByText(/changed by someone else/);
  expect(server.patches).toHaveLength(0);
  expect(server.detailsPatches).toHaveLength(0);
  expect(server.limitsPuts).toHaveLength(0);
});

test('a settings conflict prevents stale details and limits writes', async () => {
  const { server } = renderStudyWithServer();
  const { dialog, save } = await openEditDialog();
  fireEvent.change(within(dialog).getByLabelText('Data retention (days)'), { target: { value: '12' } });
  server.revision = 2;
  save();
  await within(dialog).findByText(/changed by someone else/);
  expect(server.detailsPatches).toHaveLength(0);
  expect(server.limitsPuts).toHaveLength(0);
});

test('editing survey frequency saves its setting separately from details', async () => {
  const { server } = renderStudyWithServer();
  const { dialog, save } = await openEditDialog();
  fireEvent.change(within(dialog).getByLabelText('App usage survey frequency'), { target: { value: 'HOURLY' } });
  save();
  await waitFor(() => expect(server.detailsPatches).toHaveLength(1));
  expect(server.patches.find(({ settingType }) => settingType === 'AppUsageSurvey')?.body.appUsageFrequency).toBe(
    'HOURLY',
  );
});

test('details uses the revision returned by the last settings patch', async () => {
  const { server } = renderStudyWithServer();
  const { dialog, save } = await openEditDialog();
  fireEvent.change(within(dialog).getByLabelText(/^Study name/), { target: { value: 'Renamed Study' } });
  save();
  await waitFor(() => expect(server.detailsPatches).toHaveLength(1));
  expect(server.detailsPatches[0]?.ifMatch).toBe(`"${server.detailsPatches[0]?.revision}"`);
  expect(server.detailsPatches[0]?.body).not.toHaveProperty('settings');
});

test('chains each mutation response token despite overlapping GETs remembering a newer revision', async () => {
  const { server, store } = renderStudyWithServer();
  const { dialog, policyVersion, save } = await openEditDialog();
  fireEvent.change(policyVersion(), { target: { value: 'my-policy' } });
  fireEvent.change(within(dialog).getByLabelText('Data retention (days)'), { target: { value: '12' } });
  server.readRevision = 50;
  server.afterWrite = async () => {
    await store.dispatch(studyOperationsApi.util.getRunningQueryThunk('getStudySettings', STUDY_ID));
    const read = store.dispatch(
      studyOperationsApi.endpoints.getStudySettings.initiate(STUDY_ID, { forceRefetch: true }),
    );
    await read.unwrap();
    read.unsubscribe();
    expect(knownSettingsRevision(STUDY_ID)).toBe('"50"');
  };
  save();
  await waitFor(() => expect(screen.queryByRole('dialog') === null).toBe(true));
  expect(server.patches.length).toBeGreaterThan(1);
  expect(server.patches.map((p) => p.ifMatch)).toEqual(server.patches.map((_p, index) => `"${1 + index}"`));
  expect(server.detailsPatches[0]?.ifMatch).toBe(`"${1 + server.patches.length}"`);
  expect(server.limitsIfMatch).toEqual([`"${2 + server.patches.length}"`]);
});

test('a concurrent edit between PATCHes preserves the draft despite an overlapping refetch', async () => {
  const { server, store } = renderStudyWithServer();
  const { dialog, policyVersion, save } = await openEditDialog();
  fireEvent.change(policyVersion(), { target: { value: 'my-policy' } });
  fireEvent.change(within(dialog).getByLabelText('Data retention (days)'), { target: { value: '12' } });
  server.afterWrite = async () => {
    server.afterWrite = null;
    server.revision += 1;
    await store.dispatch(studyOperationsApi.util.getRunningQueryThunk('getStudySettings', STUDY_ID));
    const read = store.dispatch(
      studyOperationsApi.endpoints.getStudySettings.initiate(STUDY_ID, { forceRefetch: true }),
    );
    await read.unwrap();
    read.unsubscribe();
    expect(knownSettingsRevision(STUDY_ID)).toBe('"3"');
  };
  save();
  await within(dialog).findByText(/changed by someone else/);
  expect(policyVersion().value).toBe('my-policy');
  expect(within(dialog).getByLabelText<HTMLInputElement>('Data retention (days)').value).toBe('12');
  expect(within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Save changes' }).disabled).toBe(true);
  expect(server.patches.map((p) => p.ifMatch)).toEqual(['"1"', '"2"']);
  expect(server.detailsPatches).toEqual([]);
  expect(server.limitsPuts).toEqual([]);
});
test('keeps the conflicted draft until an explicit discard and reload, then saves the current revision', async () => {
  const { server } = renderStudyWithServer();
  const { dialog, policyVersion, save } = await openEditDialog();
  fireEvent.change(policyVersion(), { target: { value: 'unsaved-policy' } });
  server.revision = 2; // the other user's save lands while this form is open
  save();
  await within(dialog).findByText(/changed by someone else/);
  expect(server.patches).toHaveLength(1);
  expect(server.patches[0]?.ifMatch).toBe('"1"');

  const reload = await within(dialog).findByRole('button', { name: 'Discard draft and reload latest' });
  expect(policyVersion().value).toBe('unsaved-policy');
  expect(within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Save changes' }).disabled).toBe(true);
  fireEvent.click(reload);
  const confirmation = screen.getAllByRole('dialog').find((candidate) => candidate !== dialog);
  if (!confirmation) throw new Error('Discard confirmation is missing');
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Discard draft and reload latest' }));
  await waitFor(() => expect(policyVersion().value).toBe('policy-v2'));

  save();
  await waitFor(() => expect(server.patches.slice(1).some((p) => p.settingType === 'DataCollection')).toBe(true));
  const retry = server.patches.slice(1);
  // The retry starts from the reloaded revision and chains each PATCH response's ETag.
  expect(retry.map((p) => p.ifMatch)).toEqual(retry.map((_p, i) => `"${2 + i}"`));
  const dataCollection = retry.find((p) => p.settingType === 'DataCollection');
  if (!dataCollection) throw new Error('Retry did not include the DataCollection settings');
  // The retry carries the other user's saved DataCollection entry, not the stale snapshot.
  expect((dataCollection.body.modules as Record<string, unknown>).future_module).toEqual({
    enabled: true,
    marker: 'from-revision-2',
  });
});

test('sends the revision the form was loaded from, not a newer one another read remembered', async () => {
  const { server, store } = renderStudyWithServer();
  const { dialog, save } = await openEditDialog();

  // Another user saves, and some other page refetches settings: the tab now knows ETag "2",
  // but this form still shows revision 1.
  server.revision = 2;
  await act(async () => {
    const refetch = store.dispatch(
      studyOperationsApi.endpoints.getStudySettings.initiate(STUDY_ID, { forceRefetch: true }),
    );
    await refetch;
    refetch.unsubscribe();
  });

  save();
  await within(dialog).findByText(/changed by someone else/);
  expect(server.patches.map((p) => p.ifMatch)).toEqual(['"1"']);
});

// The allSettled branch. One disjoint write failing must not hide behind
// the others' success: the dialog stays open and names exactly the step that did not save.
test('names the failed limits step while the settings PATCHes still saved', async () => {
  const { server } = renderStudyWithServer();
  const { dialog, save } = await openEditDialog();

  server.limitsFails = true;
  fireEvent.change(within(dialog).getByLabelText('Data retention (days)'), { target: { value: '12' } });
  save();
  expect(await within(dialog).findByText(/These changes did not save: study limits\./)).toBeTruthy();
  expect(within(dialog).queryByText(/changed by someone else/)).toBeNull();
  expect(server.patches.length).toBeGreaterThan(0);
  expect(server.patches.every((p) => p.ifMatch !== null)).toBe(true);
});

test('retries a partial save from the committed revision without losing unsaved limits', async () => {
  const { server } = renderStudyWithServer();
  const { dialog, save } = await openEditDialog();
  server.limitsFails = true;
  fireEvent.change(within(dialog).getByLabelText('Data retention (days)'), { target: { value: '12' } });
  save();
  await within(dialog).findByText(/These changes did not save: study limits\./);
  const committedRevision = server.revision;
  const patchCount = server.patches.length;
  expect(within(dialog).getByLabelText<HTMLInputElement>('Data retention (days)').value).toBe('12');
  server.limitsFails = false;
  save();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(server.patches[patchCount]?.ifMatch).toBe(`"${committedRevision}"`);
  expect(server.limitsPuts.at(-1)?.dataRetentionDuration).toEqual({ years: 0, months: 0, days: 12 });
});

// The limits PUT is admin-only server-side and re-derives the study end
// date on every write, so an edit that leaves the limits alone must not send them.
async function saveAndSettle(save: () => void, server: { patches: unknown[] }) {
  save();
  await waitFor(() => expect(screen.queryByRole('dialog') === null).toBe(true));
  expect(server.patches.length).toBeGreaterThan(0);
}

test('a title-only edit does not re-send the loaded limits', async () => {
  const { server } = renderStudyWithServer();
  const { dialog, save } = await openEditDialog();
  await waitFor(() =>
    expect(within(dialog).getByLabelText<HTMLInputElement>('Study duration (days)').value).not.toBe(''),
  );
  fireEvent.change(within(dialog).getByLabelText(/^Study name/), { target: { value: 'Renamed Study' } });
  await saveAndSettle(save, server);
  expect(server.limitsPuts).toEqual([]);
});

test.each([
  ['Study duration (days)', 'studyDuration', 'studyEnds'],
  ['Data retention (days)', 'dataRetentionDuration', 'studyDataExpires'],
] as const)('editing %s recomputes its dependent deadlines', async (label, duration, deadline) => {
  const { server } = renderStudyWithServer();
  const { dialog, save } = await openEditDialog();
  fireEvent.change(within(dialog).getByLabelText(label), { target: { value: '400' } });
  await saveAndSettle(save, server);
  const expected: Partial<typeof LIMITS> = { ...LIMITS, [duration]: { years: 0, months: 0, days: 400 } };
  delete expected[deadline];
  if (duration === 'studyDuration') delete expected.studyDataExpires;
  expect(server.limitsPuts).toEqual([expected]);
});

test('clearing both loaded limits saves an open-ended study', async () => {
  const { server } = renderStudyWithServer();
  const { dialog, save } = await openEditDialog();
  for (const label of ['Study duration (days)', 'Data retention (days)']) {
    fireEvent.change(within(dialog).getByLabelText(label), { target: { value: '' } });
  }
  await saveAndSettle(save, server);
  expect(server.limitsPuts).toEqual([{}]);
});

test('enabling collection saves the retained usage and battery choices from a feature-off study', async () => {
  const { server } = renderStudyWithServer(false, (server) => {
    server.features = {};
    server.storedCollection = {
      modules: {
        usage_events: { enabled: true, required: true },
        battery_telemetry: { enabled: true, required: false },
      },
    };
  });
  const { dialog, save } = await openEditDialog();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Data collection' }));
  save();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const saved = server.patches.find((patch) => patch.settingType === 'DataCollection');
  expect(saved?.body.modules).toMatchObject({
    usage_events: { enabled: true, required: true },
    battery_telemetry: { enabled: true, required: false },
  });
  expect(server.detailsPatches.at(-1)?.body.modules).toHaveProperty('CHRONICLE_DATA_COLLECTION');
});

test('a settings failure reports downstream details and limits as unsaved', async () => {
  const { server } = renderStudyWithServer();
  const { dialog, save } = await openEditDialog();
  fireEvent.change(within(dialog).getByLabelText(/^Study name/), { target: { value: 'Unsaved title' } });
  fireEvent.change(within(dialog).getByLabelText('Study duration (days)'), { target: { value: '60' } });
  server.pendingEnrollment = true;
  save();
  expect(await within(dialog).findByText(/These changes did not save:.*study details.*study limits/)).toBeTruthy();
  expect(server.detailsPatches).toEqual([]);
  expect(server.limitsPuts).toEqual([]);
});
