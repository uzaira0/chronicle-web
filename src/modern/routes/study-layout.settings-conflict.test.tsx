import { afterEach, describe, expect, mock, test } from 'bun:test';
import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { SessionBootstrap } from '@/app/session-bootstrap';
import { AUTH_DASHBOARD_LOGIN_ENDPOINT } from '@/lib/auth-endpoints';
import { bootstrapSession, logoutSession, SESSION_STATUS } from '@/state/session-slice';
import { forgetSettingsRevision, knownSettingsRevision } from '@/state/settings-revision';
import { store as dashboardStore } from '@/state/store';
import { studyOperationsApi } from '@/state/study-operations-api';

// Other route tests replace hooks of this module with fixtures, and bun keeps module mocks
// for the whole run. Put the real RTK Query hooks back so this test talks to its fetch fixture.
const realModule = await import('@/state/study-operations-api');
const realHooks = Object.fromEntries(Object.entries(studyOperationsApi).filter(([key]) => key.startsWith('use')));
await mock.module('@/state/study-operations-api', () => ({ ...realModule, ...realHooks }));
const { StudyLayout } = await import('./study-layout');

const STUDY_ID = 'conflict-study';
const savedFetch = globalThis.fetch;

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
  participantLimit: 10,
  studyDuration: { days: 0, months: 0, years: 1 },
};

function json(body: unknown, init: { etag?: string; status?: number } = {}): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.etag) headers.etag = init.etag;
  return new Response(JSON.stringify(body), { headers, status: init.status ?? 200 });
}

afterEach(() => {
  cleanup();
  dashboardStore.dispatch(studyOperationsApi.util.resetApiState());
  dashboardStore.dispatch(logoutSession.fulfilled(undefined, 'test-reset', undefined));
  forgetSettingsRevision(STUDY_ID);
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
});

function serveRead(url: string, revision: number, failLimits = false, iosSensors?: string[]): Response {
  const etag = `"${revision}"`;
  if (url.endsWith(`/study/${STUDY_ID}/lifecycle`)) return json('ACTIVE');
  // GET, and the limits PUT: the partial-failure test makes only that write fail.
  if (url.endsWith(`/limits/study/${STUDY_ID}`)) {
    return failLimits ? new Response('limits store down', { status: 500 }) : json(LIMITS);
  }
  if (url.endsWith(`/study/${STUDY_ID}/settings/type/DataCollection`)) {
    const modules = revision >= 2 ? { future_module: { enabled: true, marker: 'from-revision-2' } } : {};
    return json({ modules }, { etag });
  }
  if (url.endsWith(`/study/${STUDY_ID}/settings`)) {
    return json({ ParticipantPolicy: { ...POLICY, version: `policy-v${revision}` } }, { etag });
  }
  if (url.endsWith(`/study/${STUDY_ID}`)) {
    return json({
      contact: 'study-team@example.org',
      id: STUDY_ID,
      modules: iosSensors ? { IOS_SENSOR: {} } : { CHRONICLE_DATA_COLLECTION: {} },
      settings: iosSensors ? { Sensor: ['com.openlattice.chronicle.sensorkit.SensorSetting', iosSensors] } : {},
      title: 'Conflict Study',
    });
  }
  return new Response('not found', { status: 404 });
}

function renderStudyWithServer(iosSensors?: string[], withSessionGate = false) {
  const sessionPayload = {
    ...dashboardStore.getState().session,
    csrfToken: 'test-csrf',
    expiresAt: null,
    status: SESSION_STATUS.authenticated,
    tokenSource: 'dashboard-login' as const,
    user: { id: 'researcher', name: 'Researcher', email: null, roles: [] },
  };
  const server = {
    sessionExpired: false,
    revision: 1,
    readRevision: undefined as number | undefined,
    afterWrite: null as (() => Promise<void>) | null,
    sensorAdminOnly: false,
    limitsFails: false,
    limitsPuts: [] as Record<string, unknown>[],
    limitsIfMatch: [] as (string | null)[],
    patches: [] as { ifMatch: string | null; settingType: string; body: Record<string, unknown> }[],
    detailsPatches: [] as { ifMatch: string | null; revision: number }[],
  };
  const patchSettings = async (request: Request, settingType: string) => {
    const etag = `"${server.revision}"`;

    const ifMatch = request.headers.get('If-Match');
    server.patches.push({
      body: (await request.json()) as Record<string, unknown>,
      ifMatch,
      settingType: settingType,
    });
    if (server.sensorAdminOnly && settingType === 'Sensor') {
      return new Response('admin only', { status: 403 });
    }
    if (ifMatch !== etag) return json({ title: 'settings_conflict' }, { status: 412 });
    server.revision += 1;
    return json({}, { etag: `"${server.revision}"` });
  };
  const putLimits = async (request: Request) => {
    const etag = `"${server.revision}"`;

    server.limitsPuts.push((await request.clone().json()) as Record<string, unknown>);
    server.limitsIfMatch.push(request.headers.get('If-Match'));
    if (server.limitsFails) return new Response('limits store down', { status: 500 });
    if (request.headers.get('If-Match') !== etag) return json({}, { status: 412 });
    server.revision += 1;
    return json(LIMITS, { etag: `"${server.revision}"` });
  };
  const patchDetails = (request: Request) => {
    const etag = `"${server.revision}"`;

    server.detailsPatches.push({ ifMatch: request.headers.get('If-Match'), revision: server.revision });
    if (request.headers.get('If-Match') !== etag) return json({}, { status: 412 });
    server.revision += 1;
    return json({ id: STUDY_ID, title: 'Conflict Study' }, { etag: `"${server.revision}"` });
  };
  const serveWrite = (request: Request) => {
    const url = request.url;
    if (request.method === 'PUT' && url.endsWith(`/limits/study/${STUDY_ID}`)) return putLimits(request);
    if (request.method !== 'PATCH') return undefined;
    const settingsPatch = url.match(/\/settings\/type\/(\w+)$/);
    if (settingsPatch?.[1]) return patchSettings(request, settingsPatch[1]);
    if (url.includes(`/study/${STUDY_ID}?retrieve=true`)) return patchDetails(request);
    return json({ id: STUDY_ID, title: 'Conflict Study' });
  };
  window.location.href = 'http://localhost/';
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      const url = request.url;
      const method = request.method;
      if (url.endsWith(AUTH_DASHBOARD_LOGIN_ENDPOINT) && method === 'POST') {
        server.sessionExpired = false;
        return json({ ...sessionPayload, authenticated: true });
      }
      if (server.sessionExpired) return json({ message: 'Session expired' }, { status: 401 });
      return (
        serveWrite(request) ??
        serveRead(url, server.readRevision ?? server.revision, method === 'PUT' && server.limitsFails, iosSensors)
      );
    },
    writable: true,
  });
  // Hold the save continuation while a real settings GET settles after the mutation.
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
  const store = withSessionGate
    ? dashboardStore
    : configureStore({
        middleware: (getDefault) => getDefault().prepend(pauseWrites).concat(studyOperationsApi.middleware),
        reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
      });

  if (withSessionGate) store.dispatch(bootstrapSession.fulfilled(sessionPayload, 'session-test', undefined));
  const routes = (
    <Routes>
      <Route element={<StudyLayout />} path="/studies/:studyId" />
    </Routes>
  );

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/studies/${STUDY_ID}`]}>
        {withSessionGate ? <SessionBootstrap>{routes}</SessionBootstrap> : routes}
      </MemoryRouter>
    </Provider>,
  );

  return { server, store };
}

async function openEditDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Study' }));
  const dialog = await screen.findByRole('dialog');
  const policyVersion = () => within(dialog).getByLabelText<HTMLInputElement>(/^Policy Version/);
  await waitFor(() => expect(policyVersion().value).toBe('policy-v1'));
  const save = () => fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
  return { dialog, policyVersion, save };
}

test('a dirty study form survives a save 401 and password reauthentication', async () => {
  const { server } = renderStudyWithServer(undefined, true);
  const { dialog, policyVersion, save } = await openEditDialog();
  fireEvent.change(policyVersion(), { target: { value: 'unsaved-policy' } });
  fireEvent.change(within(dialog).getByLabelText('Participant Limit'), { target: { value: '12' } });
  server.sessionExpired = true;
  save();
  const password = await screen.findByLabelText(/dashboard password/i);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(within(dialog).getByLabelText<HTMLInputElement>(/^Policy Version/).value).toBe('unsaved-policy');
  expect(within(dialog).getByLabelText<HTMLInputElement>('Participant Limit').value).toBe('12');
  fireEvent.change(password, { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
  await waitFor(() => expect(server.limitsPuts).toHaveLength(1));
  expect(server.patches.find((patch) => patch.settingType === 'ParticipantPolicy')?.body.version).toBe(
    'unsaved-policy',
  );
  expect(server.limitsPuts[0]?.participantLimit).toBe(12);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

describe('study edit dialog after a settings 412', () => {
  test('a settings conflict prevents stale details and limits writes', async () => {
    const { server } = renderStudyWithServer();
    const { dialog, save } = await openEditDialog();
    fireEvent.change(within(dialog).getByLabelText('Participant Limit'), { target: { value: '12' } });
    server.revision = 2;
    save();
    await within(dialog).findByText(/changed by someone else/);
    expect(server.detailsPatches).toHaveLength(0);
    expect(server.limitsPuts).toHaveLength(0);
  });

  test('details uses the revision returned by the last settings patch', async () => {
    const { server } = renderStudyWithServer();
    const { dialog, save } = await openEditDialog();
    fireEvent.change(within(dialog).getByLabelText(/^Study Name/), { target: { value: 'Renamed Study' } });
    save();
    await waitFor(() => expect(server.detailsPatches).toHaveLength(1));
    expect(server.detailsPatches[0]?.ifMatch).toBe(`"${server.detailsPatches[0]?.revision}"`);
  });

  test('chains each mutation response token despite overlapping GETs remembering a newer revision', async () => {
    const { server, store } = renderStudyWithServer();
    const { dialog, policyVersion, save } = await openEditDialog();
    fireEvent.change(policyVersion(), { target: { value: 'my-policy' } });
    fireEvent.change(within(dialog).getByLabelText('Participant Limit'), { target: { value: '12' } });
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

  test('a concurrent edit between PATCHes still causes 412 and reloads the form', async () => {
    const { server, store } = renderStudyWithServer();
    const { dialog, policyVersion, save } = await openEditDialog();
    fireEvent.change(policyVersion(), { target: { value: 'my-policy' } });
    fireEvent.change(within(dialog).getByLabelText('Participant Limit'), { target: { value: '12' } });
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
    await waitFor(() => expect(policyVersion().value).toBe('policy-v3'));
    expect(server.patches.map((p) => p.ifMatch)).toEqual(['"1"', '"2"']);
    expect(server.detailsPatches).toEqual([]);
    expect(server.limitsPuts).toEqual([]);
  });
  test('reloads the form from the current settings and saves them under the new revision', async () => {
    const { server } = renderStudyWithServer();
    const { dialog, policyVersion, save } = await openEditDialog();

    server.revision = 2; // the other user's save lands while this form is open
    save();
    await within(dialog).findByText(/changed by someone else/);
    expect(server.patches).toHaveLength(1);
    expect(server.patches[0]?.ifMatch).toBe('"1"');

    // The conflict message says the form was reloaded: it must actually show revision 2.
    await waitFor(() => expect(policyVersion().value).toBe('policy-v2'));
    expect(within(dialog).getByText(/changed by someone else/)).toBeTruthy();

    save();
    await waitFor(() => expect(server.patches.slice(1).some((p) => p.settingType === 'DataCollection')).toBe(true));
    const retry = server.patches.slice(1);
    // The retry starts from the reloaded revision and chains each PATCH response's ETag.
    expect(retry.map((p) => p.ifMatch)).toEqual(retry.map((_p, i) => `"${2 + i}"`));
    const dataCollection = retry.find((p) => p.settingType === 'DataCollection');
    // The retry carries the other user's saved DataCollection entry, not the stale snapshot.
    expect((dataCollection?.body.modules as Record<string, unknown>).future_module).toEqual({
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
});

// ai-built-code S9: the allSettled branch. One disjoint write failing must not hide behind
// the others' success: the dialog stays open and names exactly the step that did not save.
describe('study edit dialog after a partial save failure', () => {
  test('names the failed limits step while the settings PATCHes still saved', async () => {
    const { server } = renderStudyWithServer();
    const { dialog, save } = await openEditDialog();

    server.limitsFails = true;
    fireEvent.change(within(dialog).getByLabelText('Participant Limit'), { target: { value: '12' } });
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
    fireEvent.change(within(dialog).getByLabelText('Participant Limit'), { target: { value: '12' } });
    save();
    await within(dialog).findByText(/These changes did not save: study limits\./);
    const committedRevision = server.revision;
    const patchCount = server.patches.length;
    expect(within(dialog).getByLabelText<HTMLInputElement>('Participant Limit').value).toBe('12');
    server.limitsFails = false;
    save();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(server.patches[patchCount]?.ifMatch).toBe(`"${committedRevision}"`);
    expect(server.limitsPuts.at(-1)?.participantLimit).toBe(12);
  });
});

// ai-built-code W1: the limits PUT is admin-only server-side and re-derives the study end
// date on every write, so an edit that leaves the limits alone must not send them.
describe('study edit dialog limits', () => {
  async function saveAndSettle(save: () => void, server: { patches: unknown[] }) {
    save();
    await waitFor(() => expect(screen.queryByRole('dialog') === null).toBe(true));
    expect(server.patches.length).toBeGreaterThan(0);
  }

  test('a title-only edit does not re-send the loaded limits', async () => {
    const { server } = renderStudyWithServer();
    const { dialog, save } = await openEditDialog();
    await waitFor(() => expect(within(dialog).getByLabelText<HTMLInputElement>('Participant Limit').value).toBe('10'));
    fireEvent.change(within(dialog).getByLabelText(/^Study Name/), { target: { value: 'Renamed Study' } });
    await saveAndSettle(save, server);
    expect(server.limitsPuts).toEqual([]);
  });

  test('an edited limit is sent', async () => {
    const { server } = renderStudyWithServer();
    const { dialog, save } = await openEditDialog();
    fireEvent.change(within(dialog).getByLabelText('Participant Limit'), { target: { value: '12' } });
    await saveAndSettle(save, server);
    expect(server.limitsPuts).toEqual([{ ...LIMITS, participantLimit: 12 }]);
    expect(server.limitsIfMatch).toEqual([`"${server.revision - 1}"`]);
  });

  test('a partly filled limit set is refused with a form error instead of binding server defaults', async () => {
    const { server } = renderStudyWithServer();
    const { dialog, save } = await openEditDialog();
    fireEvent.change(within(dialog).getByLabelText('Study Duration (days)'), { target: { value: '' } });
    save();
    expect(await within(dialog).findByText(/Fill in all 3 study limits, or leave all 3 empty/)).toBeTruthy();
    expect(server.limitsPuts).toEqual([]);
    expect(server.patches).toEqual([]);
  });

  test('clearing all loaded limits blocks saving with an inline explanation', async () => {
    const { server } = renderStudyWithServer();
    const { dialog, save } = await openEditDialog();
    for (const label of ['Participant Limit', 'Study Duration (days)', 'Data Retention (days)']) {
      fireEvent.change(within(dialog).getByLabelText(label), { target: { value: '' } });
    }
    save();
    expect(await within(dialog).findByText(/limits cannot be removed, only changed/)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(server.limitsPuts).toEqual([]);
    expect(server.patches).toEqual([]);
    expect(server.detailsPatches).toEqual([]);
  });

  test('importing empty limits over loaded limits blocks saving with the same inline explanation', async () => {
    const { server } = renderStudyWithServer();
    const { dialog, save } = await openEditDialog();
    const config = {
      format: 'chronicle-study-config',
      version: 1,
      exportedAt: '2026-09-29T00:00:00Z',
      study: {
        contact: 'study-team@example.org',
        dataRetentionDays: '',
        description: '',
        features: ['CHRONICLE_DATA_COLLECTION'],
        group: '',
        notificationsEnabled: false,
        participantLimit: '',
        studyDurationDays: '',
        title: 'Imported Study',
        version: '',
      },
    };
    const file = new File([JSON.stringify(config)], 'empty-limits.json', { type: 'application/json' });
    await act(async () => {
      fireEvent.change(within(dialog).getByTestId('study-config-file'), { target: { files: [file] } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(within(dialog).getByRole('status').textContent).toContain('empty-limits.json');
    for (const label of ['Participant Limit', 'Study Duration (days)', 'Data Retention (days)']) {
      expect(within(dialog).getByLabelText<HTMLInputElement>(label).value).toBe('');
    }
    save();
    expect(await within(dialog).findByText(/limits cannot be removed, only changed/)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(server.limitsPuts).toEqual([]);
    expect(server.patches).toEqual([]);
    expect(server.detailsPatches).toEqual([]);
  });
});

describe('study edit dialog iOS sensor setting', () => {
  test('a non-admin title-only edit with legacy iOS sensors saves without Sensor PATCH', async () => {
    const { server } = renderStudyWithServer(['deviceUsage']);
    server.sensorAdminOnly = true;
    const { dialog, save } = await openEditDialog();
    fireEvent.change(within(dialog).getByLabelText(/^Study Name/), { target: { value: 'Renamed Study' } });
    expect(within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Save changes' }).disabled).toBe(false);
    save();
    await waitFor(() => expect(screen.queryByRole('dialog') === null).toBe(true));
    expect(server.detailsPatches).toHaveLength(1);
    expect(server.patches.some((patch) => patch.settingType === 'Sensor')).toBe(false);
  });

  test('a non-admin title-only edit on a study with iOS sensors off saves details without Sensor PATCH', async () => {
    const { server } = renderStudyWithServer();
    server.sensorAdminOnly = true;
    const { dialog, save } = await openEditDialog();
    fireEvent.change(within(dialog).getByLabelText(/^Study Name/), { target: { value: 'Renamed Study' } });
    save();
    await waitFor(() => expect(server.detailsPatches).toHaveLength(1));
    expect(server.patches.some((patch) => patch.settingType === 'Sensor')).toBe(false);
  });
});
