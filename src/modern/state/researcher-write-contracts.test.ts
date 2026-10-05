import { afterEach, expect, test } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';
import { studyOperationsApi } from './study-operations-api';

const originalFetch = globalThis.fetch;
const OriginalRequest = globalThis.Request;
class RelativeRequest extends OriginalRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input, init);
  }
}
afterEach(() => { globalThis.fetch = originalFetch; globalThis.Request = OriginalRequest; });
function store() {
  globalThis.Request = RelativeRequest;
  return configureStore({ reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer }, middleware: (get) => get().concat(studyOperationsApi.middleware) });
}

test('researcher create retries preserve one key and exact body for each logical intent on all four routes', async () => {
  const app = store();
  const requests: { key: string | null; body: string; path: string }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const request = input as Request;
    requests.push({ key: request.headers.get('Idempotency-Key'), body: await request.text(), path: new URL(request.url).pathname });
    // Model a committed create whose first HTTP response was lost.
    if (requests.length % 2 === 1) throw new TypeError('lost response');
    return new Response(JSON.stringify('created'), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const e = studyOperationsApi.endpoints;
  const operations = [
    () => app.dispatch(e.createStudy.initiate({ study: { title: 'Study' }, idempotencyKey: 'study-intent' })),
    () => app.dispatch(e.createQuestionnaire.initiate({ studyId: 'study', questionnaire: { title: 'Survey', description: '', questions: [], active: true }, idempotencyKey: 'survey-intent' })),
    () => app.dispatch(e.createStudyApiKey.initiate({ studyId: 'study', name: 'Integration', scope: 'READ_ONLY', expiresInDays: 1, idempotencyKey: 'key-intent' })),
    () => app.dispatch(e.createStudyExport.initiate({ studyId: 'study', request: { dataTypes: [], format: 'CSV' }, idempotencyKey: 'export-intent' })),
  ];
  for (const send of operations) {
    expect((await send()).error).toBeDefined();
    expect((await send()).error).toBeUndefined();
    const first = requests[requests.length - 2]!; const retry = requests.at(-1)!;
    expect(first.key).toBeTruthy();
    expect(retry).toEqual(first);
    expect(first.body).not.toContain('idempotencyKey');
  }
  expect(new Set(requests.map((r) => r.path)).size).toBe(4);
  app.dispatch(studyOperationsApi.util.resetApiState());
});

for (const resource of ['annotations', 'questionnaire'] as const) {
  test(`${resource} editor snapshots carry their own ETag and stale writes cannot borrow a newer revision`, async () => {
    const app = store(); let revision = '"first"'; const writes: (string | null)[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const request = input as Request;
      if (request.method === 'PATCH') {
        writes.push(request.headers.get('If-Match'));
        return new Response('{}', { status: request.headers.get('If-Match') === revision ? 200 : 412, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify(resource === 'annotations' ? { participantNotes: 'locked content', participantTags: [] } : { id: 'q', title: 'locked content', questions: [], active: true }), { headers: { etag: revision, 'content-type': 'application/json' } });
    }) as typeof fetch;
    const e = studyOperationsApi.endpoints;
    const load = () => resource === 'annotations'
      ? app.dispatch(e.loadParticipantAnnotations.initiate({ studyId: 'study', participantId: 'participant' })).unwrap()
      : app.dispatch(e.loadQuestionnaire.initiate({ studyId: 'study', questionnaireId: 'q' })).unwrap();
    const snapshot = await load(); expect(snapshot.revision).toBe('"first"');
    revision = '"second"'; await load();
    const result = resource === 'annotations'
      ? await app.dispatch(e.updateParticipantAnnotations.initiate({ studyId: 'study', participantId: 'participant', annotations: { participantNotes: 'unsaved draft' }, ifMatch: snapshot.revision }))
      : await app.dispatch(e.updateQuestionnaire.initiate({ studyId: 'study', questionnaireId: 'q', questionnaire: { title: 'unsaved draft', description: '', active: true, questions: [] }, ifMatch: snapshot.revision }));
    expect(writes).toEqual(['"first"']); expect(result.error).toMatchObject({ status: 412 });
    app.dispatch(studyOperationsApi.util.resetApiState());
  });
}
