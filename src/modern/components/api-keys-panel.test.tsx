import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import { studyOperationsApi } from '@/state/study-operations-api';

import { ApiKeysPanel, MAX_EXPIRY_DAYS } from './api-keys-panel';

test('API-key lifetime caps match the owning server constants', () => {
  const server = readFileSync(
    '../chronicle-server/src/main/kotlin/com/openlattice/chronicle/services/apikeys/ApiKeyService.kt',
    'utf8',
  );
  for (const [scope, days] of Object.entries(MAX_EXPIRY_DAYS)) {
    const value = server.match(new RegExp(`MAX_${scope}_KEY_TTL_DAYS = (\\d+)`))?.[1];
    expect(Number(value)).toBe(days);
  }
});

const RAW_KEY = 'ck_abcd1234_secret-value';
const OWNER_PERMISSIONS = { OWNER: true, READ: true, WRITE: true };
const KEYS = [
  {
    createdAt: '2026-09-01T00:00:00Z',
    expiresAt: '2026-12-01T00:00:00Z',
    keyId: 'k-1',
    lastUsedAt: null,
    name: 'nightly export',
    prefix: 'abcd1234',
    scope: 'READ_ONLY',
    studyId: 'study-1',
  },
  {
    createdAt: '2026-09-01T00:00:00Z',
    deviceId: 'device-1',
    expiresAt: '2027-09-01T00:00:00Z',
    keyId: 'k-device',
    name: 'participant device',
    participantId: 'participant-1',
    prefix: 'dev00000',
    scope: 'WRITE',
    studyId: 'study-1',
  },
];

const savedFetch = globalThis.fetch;
const createBodies: unknown[] = [];
const revokePaths: string[] = [];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status: 200 });
}

/** A real store over a stubbed server holding [KEYS], where the user holds [permissions] on the study. */
function renderPanel(
  permissions: Record<string, boolean>,
  createGate?: Promise<void>,
  failList = false,
  failScopes = false,
) {
  window.location.href = 'http://localhost/';
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      const path = new URL(request.url, 'http://localhost').pathname;
      if (path.endsWith('/authorizations'))
        return failScopes ? new Response('', { status: 503 }) : jsonResponse([{ aclKey: ['study-1'], permissions }]);
      if (failList && request.method === 'GET' && path.endsWith('/api-keys')) {
        return new Response('', { status: 503 });
      }
      if (request.method === 'POST' && path.endsWith('/api-keys')) {
        createBodies.push(await request.json());
        await createGate;
        return jsonResponse({ info: {}, keyId: 'k-new', rawKey: RAW_KEY });
      }
      if (request.method === 'DELETE') {
        revokePaths.push(path);
        return new Response(null, { status: 204 });
      }
      return jsonResponse(KEYS);
    },
    writable: true,
  });
  const store = configureStore({
    middleware: (getDefault) => getDefault().concat(studyOperationsApi.middleware),
    reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
  });
  const panel = (studyId: string) => (
    <Provider store={store}>
      <ApiKeysPanel studyId={studyId} />
    </Provider>
  );
  const { rerender } = render(panel('study-1'));
  return { showStudy: (studyId: string) => rerender(panel(studyId)), store };
}

afterEach(() => {
  cleanup();
  createBodies.length = 0;
  revokePaths.length = 0;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
});

describe('ApiKeysPanel', () => {
  test('permission-query failure is reported with retry instead of silently hiding modification controls', async () => {
    renderPanel(OWNER_PERMISSIONS, undefined, false, true);
    expect((await screen.findByRole('alert')).textContent).toContain('permissions could not be loaded');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create key' })).toBeNull();
  });
  test('announces an API-key list failure once', async () => {
    renderPanel(OWNER_PERMISSIONS, undefined, true);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('API keys could not be loaded.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  test('lists researcher keys, creates one, shows the raw key once, keeps it out of the store, and revokes', async () => {
    const { store } = renderPanel(OWNER_PERMISSIONS);

    expect(await screen.findByText('nightly export')).toBeDefined();
    expect(screen.getByText('abcd1234')).toBeDefined();
    expect(screen.queryAllByText('participant device').length).toBe(0);

    await screen.findByRole('button', { name: 'Create key' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'pipeline' } });
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'ADMIN' } });
    // An ADMIN key may live at most 30 days, so the 90-day default is pulled down to fit.
    expect(screen.getByLabelText<HTMLInputElement>('Expires in days (1-30)').value).toBe('30');
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    expect(await screen.findByText(RAW_KEY)).toBeDefined();
    expect(createBodies).toEqual([{ expiresInDays: 30, name: 'pipeline', scope: 'ADMIN' }]);
    expect(screen.getByRole('button', { name: 'Copy API key' })).toBeDefined();
    // The raw key is held only by the panel while shown: the mutation cache never keeps it.
    expect(JSON.stringify(store.getState())).not.toContain(RAW_KEY);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryAllByText(RAW_KEY).length).toBe(0);
    expect(JSON.stringify(store.getState())).not.toContain(RAW_KEY);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    const confirmation = await screen.findByRole('dialog');
    expect(confirmation.textContent).toContain('nightly export');
    expect(revokePaths).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('nightly export')).toBeTruthy();
    expect(revokePaths).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke key' }));
    await waitFor(() => expect(revokePaths).toEqual(['/chronicle/api/web/study/study-1/api-keys/k-1']));
  });

  test('switching study drops a raw key still on screen', async () => {
    const { showStudy } = renderPanel(OWNER_PERMISSIONS);

    await screen.findByRole('button', { name: 'Create key' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'pipeline' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    expect(await screen.findByText(RAW_KEY)).toBeDefined();

    showStudy('study-2');
    expect(screen.queryAllByText(RAW_KEY).length).toBe(0);
    showStudy('study-1');
    expect(screen.queryAllByText(RAW_KEY).length).toBe(0);
  });

  test('a create response that arrives after switching away and back (A->B->A) is discarded and leaves the store', async () => {
    let releaseCreate = () => {};
    const { showStudy, store } = renderPanel(
      OWNER_PERMISSIONS,
      new Promise<void>((resolve) => {
        releaseCreate = resolve;
      }),
    );

    await screen.findByRole('button', { name: 'Create key' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'pipeline' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    await waitFor(() => expect(createBodies.length).toBe(1));

    showStudy('study-2');
    showStudy('study-1');
    releaseCreate();
    await waitFor(() => expect(Object.keys(store.getState()[studyOperationsApi.reducerPath].mutations).length).toBe(0));
    expect(screen.queryAllByText(RAW_KEY).length).toBe(0);
    expect(JSON.stringify(store.getState())).not.toContain(RAW_KEY);
  });

  test('a WRITE collaborator is offered only the scopes they hold, never ADMIN', async () => {
    renderPanel({ OWNER: false, READ: true, WRITE: true });

    await screen.findByRole('button', { name: 'Create key' });
    const options = Array.from(screen.getByLabelText<HTMLSelectElement>('Scope').options).map((option) => option.value);
    expect(options).toEqual(['READ_ONLY', 'WRITE']);
  });

  test('users without modify access see the list but cannot create or revoke', async () => {
    renderPanel({ OWNER: false, READ: true, WRITE: false });

    expect(await screen.findByText('nightly export')).toBeDefined();
    await waitFor(() => expect(screen.queryAllByRole('button', { name: 'Create key' }).length).toBe(0));
    expect(screen.queryAllByRole('button', { name: 'Revoke' }).length).toBe(0);
  });
});
