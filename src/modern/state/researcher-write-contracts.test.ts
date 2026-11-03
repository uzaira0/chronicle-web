import { afterEach, expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';
import { studyOperationsApi } from './study-operations-api';

const originalFetch = globalThis.fetch;
let restoreRequest: () => void;
afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreRequest();
});
function store() {
  restoreRequest = installRelativeRequest();
  return createApiStore();
}

test('researcher create retries preserve one key and exact body for each logical intent on all three routes', async () => {
  const app = store();
  const requests: { key: string | null; body: string; path: string }[] = [];
  globalThis.fetch = routeFetch(
    Object.fromEntries(
      [
        '/chronicle/api/web/study',
        '/chronicle/api/web/survey/study/questionnaire',
        '/chronicle/api/web/study/study/api-keys',
      ].map((path) => [
        `POST ${path}`,
        async (request: Request) => {
          requests.push({
            key: request.headers.get('Idempotency-Key'),
            body: await request.text(),
            path: new URL(request.url).pathname,
          });
          if (requests.length % 2 === 1) throw new TypeError('lost response');
          return Response.json('created');
        },
      ]),
    ),
  );
  const e = studyOperationsApi.endpoints;
  const operations = [
    () => app.dispatch(e.createStudy.initiate({ study: { title: 'Study' }, idempotencyKey: 'study-intent' })),
    () =>
      app.dispatch(
        e.createQuestionnaire.initiate({
          studyId: 'study',
          questionnaire: { title: 'Survey', description: '', questions: [], active: true },
          idempotencyKey: 'survey-intent',
        }),
      ),
    () =>
      app.dispatch(
        e.createStudyApiKey.initiate({
          studyId: 'study',
          name: 'Integration',
          scope: 'READ_ONLY',
          expiresInDays: 1,
          idempotencyKey: 'key-intent',
        }),
      ),
  ];
  for (const send of operations) {
    expect((await send()).error).toBeDefined();
    expect((await send()).error).toBeUndefined();
    const first = requests.at(-2);
    const retry = requests.at(-1);
    expect(first?.key).toBeTruthy();
    expect(retry).toEqual(first);
    expect(first?.body).not.toContain('idempotencyKey');
  }
  expect(new Set(requests.map((r) => r.path)).size).toBe(3);
  app.dispatch(studyOperationsApi.util.resetApiState());
});

for (const resource of ['annotations', 'questionnaire'] as const) {
  test(`${resource} editor snapshots carry their own ETag and stale writes cannot borrow a newer revision`, async () => {
    const app = store();
    let revision = '"first"';
    const writes: (string | null)[] = [];
    const path =
      resource === 'annotations'
        ? '/chronicle/api/web/study/study/participant/participant/annotations'
        : '/chronicle/api/web/survey/study/questionnaire/q';
    globalThis.fetch = routeFetch({
      [`PATCH ${path}`]: (request) => {
        writes.push(request.headers.get('If-Match'));
        return Response.json({}, { status: request.headers.get('If-Match') === revision ? 200 : 412 });
      },
      [`GET ${path}`]: () =>
        Response.json(
          resource === 'annotations'
            ? { participantNotes: 'locked content', participantTags: [] }
            : { id: 'q', title: 'locked content', questions: [], active: true },
          { headers: { etag: revision } },
        ),
    });
    const e = studyOperationsApi.endpoints;
    const load = () =>
      resource === 'annotations'
        ? app
            .dispatch(e.loadParticipantAnnotations.initiate({ studyId: 'study', participantId: 'participant' }))
            .unwrap()
        : app.dispatch(e.loadQuestionnaire.initiate({ studyId: 'study', questionnaireId: 'q' })).unwrap();
    const snapshot = await load();
    expect(snapshot.revision).toBe('"first"');
    revision = '"second"';
    await load();
    const result =
      resource === 'annotations'
        ? await app.dispatch(
            e.updateParticipantAnnotations.initiate({
              studyId: 'study',
              participantId: 'participant',
              annotations: { participantNotes: 'unsaved draft' },
              ifMatch: snapshot.revision,
            }),
          )
        : await app.dispatch(
            e.updateQuestionnaire.initiate({
              studyId: 'study',
              questionnaireId: 'q',
              questionnaire: { title: 'unsaved draft', description: '', active: true, questions: [] },
              ifMatch: snapshot.revision,
            }),
          );
    expect(writes).toEqual(['"first"']);
    expect(result.error).toMatchObject({ status: 412 });
    app.dispatch(studyOperationsApi.util.resetApiState());
  });
}

test('access-code issuance escapes ids and sends an expiry only for enrollment', async () => {
  const app = store();
  const requests: { path: string; body: Record<string, unknown>; method: string | undefined }[] = [];
  globalThis.fetch = routeFetch({
    'POST /chronicle/api/web/study/study%2F1/participant/participant%2F1/form-access-codes': async (request) => {
      requests.push({
        path: new URL(request.url).pathname,
        body: (await request.json()) as Record<string, unknown>,
        method: request.method,
      });
      return Response.json({ accessCode: 'a'.repeat(32) });
    },
  });
  const before = Date.now();
  for (const formKind of ['ENROLLMENT', 'TIME_USE_DIARY'] as const) {
    const issued = await app
      .dispatch(
        studyOperationsApi.endpoints.issueParticipantAccessCode.initiate({
          studyId: 'study/1',
          participantId: 'participant/1',
          formKind,
          ...(formKind === 'TIME_USE_DIARY' ? { logicalDate: '2026-10-06' } : {}),
        }),
      )
      .unwrap();
    expect(issued.accessCode).toBe('a'.repeat(32));
  }
  expect(requests.map(({ path, method }) => [path, method])).toEqual([
    ['/chronicle/api/web/study/study%2F1/participant/participant%2F1/form-access-codes', 'POST'],
    ['/chronicle/api/web/study/study%2F1/participant/participant%2F1/form-access-codes', 'POST'],
  ]);
  const expiry = Date.parse(String(requests[0]?.body.expiresAt));
  const expectedLifetime = 29 * 86_400_000;
  expect(expiry - before).toBeGreaterThanOrEqual(expectedLifetime);
  expect(expiry - Date.now()).toBeLessThanOrEqual(expectedLifetime);
  expect(requests[0]?.body.logicalDate).toBeUndefined();
  expect(requests[1]?.body).toEqual({ formKind: 'TIME_USE_DIARY', logicalDate: '2026-10-06' });
  app.dispatch(studyOperationsApi.util.resetApiState());
});

test('Erase now refreshes the study’s deletion list with the server’s new status', async () => {
  const app = store();
  const e = studyOperationsApi.endpoints;
  const operation = {
    mode: 'WITHDRAW_AND_ERASE',
    operationId: 'op',
    requestedAt: '2026-10-22T00:00:00Z',
    status: 'QUARANTINED',
    studyId: 'study',
  };
  globalThis.fetch = routeFetch({
    'GET /chronicle/api/web/study/study/deletions': () => Response.json([operation]),
    'POST /chronicle/api/web/study/study/deletions/op/erase': () => {
      operation.status = 'ERASING';
      return Response.json(operation);
    },
  });
  const statuses = () =>
    e.getStudyDeletions
      .select('study')(app.getState())
      .data?.map(({ status }) => status);
  const list = app.dispatch(e.getStudyDeletions.initiate('study'));
  await list;
  expect(statuses()).toEqual(['QUARANTINED']);

  await app.dispatch(e.eraseDeletion.initiate({ operationId: 'op', studyId: 'study' })).unwrap();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await app.dispatch(e.getStudyDeletions.initiate('study')).unwrap();

  expect(statuses()).toEqual(['ERASING']);
  list.unsubscribe();
});

test('status, processing-block and lifecycle writes send the revision the page read and refetch it on 412', async () => {
  const app = store();
  const base = '/chronicle/api/web/study/study';
  const sent: Record<string, string | null> = {};
  const reads = { participants: 0, study: 0, lifecycle: 0 };
  const conflict = (key: string) => (request: Request) => {
    sent[key] = request.headers.get('If-Match');
    return Response.json({ message: 'This study changed in another window.' }, { status: 412 });
  };
  globalThis.fetch = routeFetch({
    [`GET ${base}/participants`]: () => {
      reads.participants += 1;
      return Response.json([{ participantId: 'p1', participationStatus: 'ENROLLED', statusRevision: 3 }]);
    },
    [`GET ${base}`]: () => {
      reads.study += 1;
      return Response.json({ id: 'study', title: 'Study' }, { headers: { etag: '"4"' } });
    },
    [`GET ${base}/lifecycle`]: () => {
      reads.lifecycle += 1;
      return Response.json('ACTIVE');
    },
    [`PATCH ${base}/participant/p1/status`]: conflict('status'),
    [`POST ${base}/participant/p1/processing-block`]: conflict('block'),
    [`DELETE ${base}/participant/p1/processing-block`]: conflict('unblock'),
    [`POST ${base}/archive`]: conflict('archive'),
    [`POST ${base}/unarchive`]: conflict('unarchive'),
  });
  const e = studyOperationsApi.endpoints;
  const participants = app.dispatch(e.getStudyParticipants.initiate('study'));
  const summary = app.dispatch(e.getStudySummary.initiate('study'));
  const lifecycle = app.dispatch(e.getStudyLifecycleStatus.initiate('study'));
  const participant = (await participants).data?.[0];
  const ifMatch = (await summary).data?.settingsRevision;
  await lifecycle;
  expect(participant?.statusRevision).toBe(3);
  expect(ifMatch).toBe('"4"');
  const statusRevision = participant?.statusRevision ?? -1;
  const p1 = { studyId: 'study', participantId: 'p1', statusRevision };
  const writes: [keyof typeof reads, () => Promise<{ error?: unknown }>][] = [
    ['participants', () => app.dispatch(e.updateParticipationStatus.initiate({ ...p1, status: 'PAUSED' }))],
    [
      'participants',
      () => app.dispatch(e.setParticipantProcessingBlock.initiate({ ...p1, blocked: true, reason: 'Review' })),
    ],
    ['participants', () => app.dispatch(e.setParticipantProcessingBlock.initiate({ ...p1, blocked: false }))],
    ['lifecycle', () => app.dispatch(e.archiveStudy.initiate({ studyId: 'study', ifMatch }))],
    ['study', () => app.dispatch(e.unarchiveStudy.initiate({ studyId: 'study', ifMatch }))],
  ];
  for (const [refetched, write] of writes) {
    const before = reads[refetched];
    expect((await write()).error).toMatchObject({ status: 412 });
    // The conflict refetches what the page shows, so the next try starts from the other window's change.
    await waitFor(() => expect(reads[refetched]).toBeGreaterThan(before));
  }
  expect(sent).toEqual({ status: '"3"', block: '"3"', unblock: '"3"', archive: '"4"', unarchive: '"4"' });
  for (const subscription of [participants, summary, lifecycle]) subscription.unsubscribe();
  app.dispatch(studyOperationsApi.util.resetApiState());
});
