import { afterEach, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { SessionBootstrap } from '@/app/session-bootstrap';
import { LanguageProvider } from '@/i18n';
import { AUTH_DASHBOARD_LOGIN_ENDPOINT } from '@/lib/auth-endpoints';
import { bootstrapSession, expireSession, logoutSession, SESSION_STATUS } from '@/state/session-slice';
import { store as dashboardStore } from '@/state/store';
import { studyOperationsApi } from '@/state/study-operations-api';
import { installRelativeRequest } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';

const realModule = await import('@/state/study-operations-api');
const realHooks = Object.fromEntries(Object.entries(studyOperationsApi).filter(([key]) => key.startsWith('use')));
await mock.module('@/state/study-operations-api', () => ({ ...realModule, ...realHooks }));
const { ParticipantNotesEditor } = await import('./participant-notes-editor');
const savedFetch = globalThis.fetch;
let restoreRequest: () => void;
afterEach(() => {
  cleanup();
  dashboardStore.dispatch(studyOperationsApi.util.resetApiState());
  dashboardStore.dispatch(logoutSession.fulfilled(undefined, 'test-reset', undefined));
  globalThis.fetch = savedFetch;
  restoreRequest();
});

test('notes load a locked snapshot, preserve a rejected draft, and reload only when explicitly discarded', async () => {
  restoreRequest = installRelativeRequest();
  let revision = '"one"';
  const sent: { tag: string | null; body: string }[] = [];
  let closed = false;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const request = input as Request;
    if (request.method === 'PATCH') {
      sent.push({ tag: request.headers.get('If-Match'), body: await request.text() });
      return new Response('{}', { status: 412, headers: { 'content-type': 'application/json' } });
    }
    return new Response(
      JSON.stringify({
        participantNotes: revision === '"one"' ? 'locked notes' : 'latest notes',
        participantTags: ['original'],
      }),
      { headers: { etag: revision, 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  const store = createApiStore();
  render(
    <Provider store={store}>
      <LanguageProvider initialSearch="">
        <ParticipantNotesEditor
          studyId="study"
          participant={{ participantId: 'p', participantNotes: 'cached notes', participantTags: [] } as never}
          onClose={() => {
            closed = true;
          }}
        />
      </LanguageProvider>
    </Provider>,
  );
  await waitFor(() => expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('locked notes'));
  fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'unsaved notes' } });
  revision = '"two"';
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Your draft is still here'));
  expect(sent).toEqual([
    { tag: '"one"', body: JSON.stringify({ participantNotes: 'unsaved notes', participantTags: ['original'] }) },
  ]);
  expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('unsaved notes');
  expect(closed).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Discard draft and reload latest' }));
  await waitFor(() => expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('latest notes'));
  store.dispatch(studyOperationsApi.util.resetApiState());
});

test('notes and tags retain their draft and original revision through idle lock and password reauthentication', async () => {
  restoreRequest = installRelativeRequest();
  const session = {
    ...dashboardStore.getState().session,
    csrfToken: 'test-csrf',
    expiresAt: null,
    idleExpiresAt: null,
    status: SESSION_STATUS.authenticated,
    tokenSource: 'dashboard-login' as const,
    user: { id: 'researcher', email: null, name: 'Researcher', roles: [] },
  };
  let loads = 0;
  const sent: { tag: string | null; body: string }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    if (new URL(request.url).pathname === AUTH_DASHBOARD_LOGIN_ENDPOINT) {
      return Response.json({ ...session, authenticated: true });
    }
    if (request.method === 'PATCH') {
      sent.push({ tag: request.headers.get('If-Match'), body: await request.text() });
      return new Response('{}', { status: 412, headers: { 'content-type': 'application/json' } });
    }
    loads += 1;
    return Response.json(
      { participantNotes: loads === 1 ? 'saved notes' : 'new server notes', participantTags: ['original'] },
      { headers: { etag: loads === 1 ? '"one"' : '"two"' } },
    );
  }) as typeof fetch;
  dashboardStore.dispatch(bootstrapSession.fulfilled(session, 'test-session', undefined));
  render(
    <Provider store={dashboardStore}>
      <MemoryRouter>
        <SessionBootstrap>
          <ParticipantNotesEditor
            studyId="study"
            participant={{ participantId: 'p', participantTags: [] } as never}
            onClose={() => undefined}
          />
        </SessionBootstrap>
      </MemoryRouter>
    </Provider>,
  );
  await waitFor(() => expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('saved notes'));
  fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'unsaved notes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove tag original' }));
  fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'draft-tag' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
  await act(() => dashboardStore.dispatch(expireSession()));
  const password = await screen.findByLabelText(/dashboard password/i);
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.change(password, { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
  await screen.findByRole('dialog');
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(false));
  expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('unsaved notes');
  expect(screen.getByRole('button', { name: 'Remove tag draft-tag' })).toBeTruthy();
  expect(loads).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('alert');
  expect(sent).toEqual([
    { tag: '"one"', body: JSON.stringify({ participantNotes: 'unsaved notes', participantTags: ['draft-tag'] }) },
  ]);
});
