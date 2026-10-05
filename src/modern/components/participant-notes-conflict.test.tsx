import { afterEach, expect, mock, test } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { LanguageProvider } from '@/i18n';
import { studyOperationsApi } from '@/state/study-operations-api';
const realModule = await import('@/state/study-operations-api');
const realHooks = Object.fromEntries(Object.entries(studyOperationsApi).filter(([key]) => key.startsWith('use')));
await mock.module('@/state/study-operations-api', () => ({ ...realModule, ...realHooks }));
const { ParticipantNotesEditor } = await import('./participant-notes-editor');
const savedFetch = globalThis.fetch;
const SavedRequest = globalThis.Request;
class RelativeRequest extends SavedRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input, init);
  }
}
afterEach(() => { cleanup(); globalThis.fetch = savedFetch; globalThis.Request = SavedRequest; });

test('notes load a locked snapshot, preserve a rejected draft, and reload only when explicitly discarded', async () => {
  globalThis.Request = RelativeRequest;
  let revision = '"one"'; const sent: { tag: string | null; body: string }[] = []; let closed = false;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const request = input as Request;
    if (request.method === 'PATCH') {
      sent.push({ tag: request.headers.get('If-Match'), body: await request.text() });
      return new Response('{}', { status: 412, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ participantNotes: revision === '"one"' ? 'locked notes' : 'latest notes', participantTags: ['original'] }), { headers: { etag: revision, 'content-type': 'application/json' } });
  }) as typeof fetch;
  const store = configureStore({ reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer }, middleware: (get) => get().concat(studyOperationsApi.middleware) });
  render(<Provider store={store}><LanguageProvider initialSearch=""><ParticipantNotesEditor studyId="study" participant={{ participantId: 'p', participantNotes: 'cached notes', participantTags: [] } as never} onClose={() => { closed = true; }} /></LanguageProvider></Provider>);
  await waitFor(() => expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('locked notes'));
  fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'unsaved notes' } });
  revision = '"two"';
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Your draft is still here'));
  expect(sent).toEqual([{ tag: '"one"', body: JSON.stringify({ participantNotes: 'unsaved notes', participantTags: ['original'] }) }]);
  expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('unsaved notes');
  expect(closed).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Discard draft and reload latest' }));
  await waitFor(() => expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('latest notes'));
  store.dispatch(studyOperationsApi.util.resetApiState());
});
