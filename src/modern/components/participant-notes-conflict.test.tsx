import { afterEach, expect, jest, mock, test } from 'bun:test';
import { chromium } from '@playwright/test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { SessionBootstrap } from '@/app/session-bootstrap';
import { LanguageProvider } from '@/i18n';
import english from '@/i18n/en/translation.json';
import { AUTH_DASHBOARD_LOGIN_ENDPOINT } from '@/lib/auth-endpoints';
import { bootstrapSession, expireSession, logoutSession, SESSION_STATUS } from '@/state/session-slice';
import { store as dashboardStore } from '@/state/store';
import { studyOperationsApi } from '@/state/study-operations-api';
import { leaveIsBlocked } from '@/test/browser-env';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';
import { ParticipantNotesEditor } from './participant-notes-editor';

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
  globalThis.fetch = routeFetch({
    'PATCH /chronicle/api/web/study/study/participant/p/annotations': async (request) => {
      sent.push({ tag: request.headers.get('If-Match'), body: await request.text() });
      return Response.json({}, { status: 412 });
    },
    'GET /chronicle/api/web/study/study/participant/p/annotations': () =>
      Response.json(
        {
          participantNotes: revision === '"one"' ? 'locked notes' : 'latest notes',
          participantTags: ['original'],
        },
        { headers: { etag: revision } },
      ),
  });
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
  expect(leaveIsBlocked()).toBe(false);
  fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'unsaved notes' } });
  expect(leaveIsBlocked()).toBe(true);
  revision = '"two"';
  fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Your draft is still here'));
  expect(sent).toEqual([
    { tag: '"one"', body: JSON.stringify({ participantNotes: 'unsaved notes', participantTags: ['original'] }) },
  ]);
  expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('unsaved notes');
  expect(closed).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Discard draft and reload latest' }));
  await waitFor(() => expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('latest notes'));
  expect(leaveIsBlocked()).toBe(false);
  store.dispatch(studyOperationsApi.util.resetApiState());
});

test('notes and every tag control are disabled until a pending save completes', async () => {
  restoreRequest = installRelativeRequest();
  const response = Promise.withResolvers<Response>();
  const sent: unknown[] = [];
  const onClose = mock(() => undefined);
  globalThis.fetch = routeFetch({
    'GET /chronicle/api/web/study/study/participant/p/annotations': () =>
      Response.json({ participantNotes: 'saved notes', participantTags: ['original'] }, { headers: { etag: '"one"' } }),
    'PATCH /chronicle/api/web/study/study/participant/p/annotations': async (request) => {
      sent.push(await request.json());
      return response.promise;
    },
  });
  const store = createApiStore();
  render(
    <Provider store={store}>
      <ParticipantNotesEditor
        studyId="study"
        participant={{ participantId: 'p', participantTags: [] } as never}
        onClose={onClose}
      />
    </Provider>,
  );
  await waitFor(() => expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('saved notes'));
  fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'click-time notes' } });
  fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'draft-tag' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent).toEqual([{ participantNotes: 'click-time notes', participantTags: ['original', 'draft-tag'] }]);
  const controls = [
    screen.getByLabelText('Notes'),
    screen.getByLabelText('Tags'),
    screen.getByRole('button', { name: 'Add tag' }),
    screen.getByRole('button', { name: 'Remove tag original' }),
  ];
  for (const control of controls) {
    expect(control.matches(':disabled') || control.closest('fieldset[disabled]') !== null).toBe(true);
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(screen.getByRole('dialog').outerHTML);
    for (const control of [
      page.getByLabel('Notes', { exact: true }),
      page.getByLabel('Tags', { exact: true }),
      page.getByRole('button', { name: 'Add tag' }),
      page.getByRole('button', { name: 'Remove tag original' }),
    ]) {
      expect(await control.isDisabled()).toBe(true);
      await control.evaluate((element) => {
        const field = element as HTMLElement;
        field.focus();
        field.click();
      });
      await page.keyboard.insertText('pending edit');
    }
    expect(await page.getByLabel('Notes', { exact: true }).inputValue()).toBe('click-time notes');
    expect(await page.getByLabel('Tags', { exact: true }).inputValue()).toBe('draft-tag');
  } finally {
    await browser.close();
  }
  expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('click-time notes');
  expect(screen.getByRole('button', { name: 'Remove tag original' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Remove tag draft-tag' })).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
  await act(() => {
    response.resolve(Response.json({}));
    return response.promise;
  });
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(sent).toEqual([{ participantNotes: 'click-time notes', participantTags: ['original', 'draft-tag'] }]);
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
  globalThis.fetch = routeFetch({
    [`POST ${AUTH_DASHBOARD_LOGIN_ENDPOINT}`]: () => Response.json({ ...session, authenticated: true }),
    'PATCH /chronicle/api/web/study/study/participant/p/annotations': async (request) => {
      sent.push({ tag: request.headers.get('If-Match'), body: await request.text() });
      return Response.json({}, { status: 412 });
    },
    'GET /chronicle/api/web/study/study/participant/p/annotations': () => {
      loads += 1;
      return Response.json(
        { participantNotes: loads === 1 ? 'saved notes' : 'new server notes', participantTags: ['original'] },
        { headers: { etag: loads === 1 ? '"one"' : '"two"' } },
      );
    },
  });
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
  expect(leaveIsBlocked()).toBe(true);
  fireEvent.change(password, { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
  await screen.findByRole('dialog');
  await waitFor(() =>
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save notes' }).disabled).toBe(false),
  );
  expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('unsaved notes');
  expect(screen.getByRole('button', { name: 'Remove tag draft-tag' })).toBeTruthy();
  expect(loads).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
  await screen.findByRole('alert');
  expect(sent).toEqual([
    { tag: '"one"', body: JSON.stringify({ participantNotes: 'unsaved notes', participantTags: ['draft-tag'] }) },
  ]);
});

test('a pending save cannot be dismissed, and a failed save keeps the draft until a confirmed discard', async () => {
  restoreRequest = installRelativeRequest();
  const response = Promise.withResolvers<Response>();
  const onClose = mock(() => undefined);
  const prompts: string[] = [];
  const savedConfirmDescriptor = Object.getOwnPropertyDescriptor(window, 'confirm');
  window.confirm = (message?: string) => {
    prompts.push(String(message));
    return false;
  };
  globalThis.fetch = routeFetch({
    'GET /chronicle/api/web/study/study/participant/p/annotations': () =>
      Response.json({ participantNotes: 'saved notes', participantTags: [] }, { headers: { etag: '"one"' } }),
    'PATCH /chronicle/api/web/study/study/participant/p/annotations': () => response.promise,
  });
  const store = createApiStore();
  try {
    jest.useFakeTimers();
    render(
      <Provider store={store}>
        <ParticipantNotesEditor
          studyId="study"
          participant={{ participantId: 'p', participantTags: [] } as never}
          onClose={onClose}
        />
      </Provider>,
    );
    await act(() => jest.advanceTimersByTime(0));
    jest.useRealTimers();
    await waitFor(() => expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('saved notes'));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'unsent notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
    await waitFor(() => expect(screen.getByLabelText('Notes').closest('fieldset[disabled]')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.pointerDown(document.body, { button: 0, pointerType: 'mouse' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(prompts).toEqual([]);

    await act(() => {
      response.resolve(Response.json({ message: 'Annotations unavailable' }, { status: 503 }));
      return response.promise;
    });
    await screen.findByRole('alert');
    expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('unsent notes');
    // The draft now exists only here: dismissing asks first, and declining keeps the editor.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.pointerDown(document.body, { button: 0, pointerType: 'mouse' });
    expect(prompts).toEqual([english.common.leave_unsaved, english.common.leave_unsaved, english.common.leave_unsaved]);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('unsent notes');
    expect(screen.getByRole('alert')).toBeTruthy();
  } finally {
    jest.useRealTimers();
    if (savedConfirmDescriptor) Object.defineProperty(window, 'confirm', savedConfirmDescriptor);
    else Reflect.deleteProperty(window, 'confirm');
    store.dispatch(studyOperationsApi.util.resetApiState());
  }
});

// A dropped connection while opening the editor must not leave the cached (possibly stale) notes saveable: the editor
// stays locked until a reload reads the server's revision. Tags typed with Enter are added once and saved.
test('a failed notes load keeps the editor locked until reload, and Enter adds each tag once', async () => {
  restoreRequest = installRelativeRequest();
  let loadStatus = 503;
  const sent: { tag: string | null; body: unknown }[] = [];
  const onClose = mock(() => undefined);
  globalThis.fetch = routeFetch({
    'GET /chronicle/api/web/study/study/participant/p/annotations': () =>
      loadStatus === 200
        ? Response.json(
            { participantNotes: 'server notes', participantTags: ['wave-1'] },
            { headers: { etag: '"one"' } },
          )
        : Response.json({}, { status: loadStatus }),
    'PATCH /chronicle/api/web/study/study/participant/p/annotations': async (request) => {
      sent.push({ tag: request.headers.get('If-Match'), body: await request.json() });
      return Response.json({});
    },
  });
  const store = createApiStore();
  render(
    <Provider store={store}>
      <ParticipantNotesEditor
        studyId="study"
        participant={{ participantId: 'p', participantNotes: 'cached notes', participantTags: [] } as never}
        onClose={onClose}
      />
    </Provider>,
  );
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to load annotations.');
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save notes' }).disabled).toBe(true);
  expect(screen.getByLabelText('Notes').closest('fieldset[disabled]')).not.toBeNull();

  loadStatus = 200;
  fireEvent.click(screen.getByRole('button', { name: english.writes.reload_discard }));
  await waitFor(() => expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('server notes'));
  expect(screen.queryByRole('alert')).toBeNull();
  const tagInput = screen.getByLabelText<HTMLInputElement>('Tags');
  for (const value of ['  consent-call ', 'consent-call']) {
    fireEvent.change(tagInput, { target: { value } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    expect(tagInput.value).toBe('');
  }
  expect(screen.getAllByRole('button', { name: 'Remove tag consent-call' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(sent).toEqual([
    { tag: '"one"', body: { participantNotes: 'server notes', participantTags: ['wave-1', 'consent-call'] } },
  ]);
  store.dispatch(studyOperationsApi.util.resetApiState());
});

test('typing a pending tag protects Cancel and saves it without Enter', async () => {
  restoreRequest = installRelativeRequest();
  const sent: unknown[] = [];
  const onClose = mock(() => undefined);
  const savedConfirmDescriptor = Object.getOwnPropertyDescriptor(window, 'confirm');
  const confirm = mock(() => false);
  window.confirm = confirm;
  globalThis.fetch = routeFetch({
    'GET /chronicle/api/web/study/study/participant/p/annotations': () =>
      Response.json(
        { participantNotes: 'server notes', participantTags: ['original'] },
        { headers: { etag: '"one"' } },
      ),
    'PATCH /chronicle/api/web/study/study/participant/p/annotations': async (request) => {
      sent.push(await request.json());
      return Response.json({});
    },
  });
  const store = createApiStore();
  try {
    render(
      <Provider store={store}>
        <ParticipantNotesEditor
          studyId="study"
          participant={{ participantId: 'p', participantTags: [] } as never}
          onClose={onClose}
        />
      </Provider>,
    );
    await waitFor(() => expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('server notes'));
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: '  pending-tag  ' } });
    expect(leaveIsBlocked()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledWith(english.common.leave_unsaved);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([{ participantNotes: 'server notes', participantTags: ['original', 'pending-tag'] }]);
  } finally {
    if (savedConfirmDescriptor) Object.defineProperty(window, 'confirm', savedConfirmDescriptor);
    else Reflect.deleteProperty(window, 'confirm');
    store.dispatch(studyOperationsApi.util.resetApiState());
  }
});
