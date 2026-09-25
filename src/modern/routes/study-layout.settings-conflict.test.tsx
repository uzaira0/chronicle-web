import { afterEach, describe, expect, mock, test } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';

import { forgetSettingsRevision } from '@/state/settings-revision';
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
  forgetSettingsRevision(STUDY_ID);
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
});

function serveRead(url: string, revision: number, failLimits = false): Response {
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
      modules: { CHRONICLE_DATA_COLLECTION: {} },
      settings: {},
      title: 'Conflict Study',
    });
  }
  return new Response('not found', { status: 404 });
}

function renderStudyWithServer() {
  const server = {
    revision: 1,
    limitsFails: false,
    limitsPuts: [] as Record<string, unknown>[],
    patches: [] as { ifMatch: string | null; settingType: string; body: Record<string, unknown> }[],
  };
  window.location.href = 'http://localhost/';
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      const url = request.url;
      const method = request.method;
      const etag = `"${server.revision}"`;
      const settingsPatch = url.match(/\/settings\/type\/(\w+)$/);
      if (method === 'PATCH' && settingsPatch?.[1]) {
        const ifMatch = request.headers.get('If-Match');
        server.patches.push({
          body: (await request.json()) as Record<string, unknown>,
          ifMatch,
          settingType: settingsPatch[1],
        });
        if (ifMatch !== etag) return json({ title: 'settings_conflict' }, { status: 412 });
        server.revision += 1;
        return json({}, { etag: `"${server.revision}"` });
      }
      if (method === 'PUT' && url.endsWith(`/limits/study/${STUDY_ID}`)) {
        server.limitsPuts.push((await request.clone().json()) as Record<string, unknown>);
      }
      return method === 'PATCH'
        ? json({ id: STUDY_ID, title: 'Conflict Study' })
        : serveRead(url, server.revision, method === 'PUT' && server.limitsFails);
    },
    writable: true,
  });
  const store = configureStore({
    middleware: (getDefault) => getDefault().concat(studyOperationsApi.middleware),
    reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
  });

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/studies/${STUDY_ID}`]}>
        <Routes>
          <Route element={<StudyLayout />} path="/studies/:studyId" />
        </Routes>
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
  const save = () => fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
  return { dialog, policyVersion, save };
}

describe('study edit dialog after a settings 412', () => {
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
  });

  test('a partly filled limit set is refused with a form error instead of binding server defaults', async () => {
    const { server } = renderStudyWithServer();
    const { dialog, save } = await openEditDialog();
    fireEvent.change(within(dialog).getByLabelText('Study Duration (days)'), { target: { value: '' } });
    save();
    expect(await within(dialog).findByText(/Fill in all three study limits, or leave all three empty/)).toBeTruthy();
    expect(server.limitsPuts).toEqual([]);
    expect(server.patches).toEqual([]);
  });
});
