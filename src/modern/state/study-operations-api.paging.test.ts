import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import english from '@/i18n/en/translation.json';
import { getErrorMessage } from '@/lib/errors';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';

import { studyOperationsApi } from './study-operations-api';

// The server pages every list (default page 100, max 500; audit and
// acknowledgments max 200). A study with more rows than one page must still show them all.

let restoreRequest: () => void;

let savedFetch: typeof globalThis.fetch;
let savedDocument: typeof globalThis.document | undefined;
let requested: string[];

/** A server that pages `rows` the way the backend does: default and maximum page size, then offset. */
function serve(path: string, rows: unknown[], { defaultLimit = 100, maxLimit = 500 } = {}) {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: routeFetch({
      [`GET ${path}`]: (request) => {
        const url = new URL(request.url);
        requested.push(url.pathname + url.search);
        const limit = Math.min(Number(url.searchParams.get('limit') ?? defaultLimit), maxLimit);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const page = rows.slice(offset, offset + limit);
        return Response.json(Array.isArray(page[0]) ? Object.fromEntries(page as [string, unknown][]) : page);
      },
    }),
    writable: true,
  });
}

async function read<T>(endpoint: { initiate: (arg: T) => unknown }, arg: T) {
  const store = createApiStore();
  const request: { unwrap: () => Promise<unknown>; unsubscribe: () => void } = store.dispatch(
    endpoint.initiate(arg) as never,
  );
  try {
    return await request.unwrap();
  } finally {
    request.unsubscribe();
  }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

beforeEach(() => {
  requested = [];
  savedFetch = globalThis.fetch;
  savedDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: '' }, writable: true });
  restoreRequest = installRelativeRequest();
});

afterEach(() => {
  restoreRequest();
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: savedDocument, writable: true });
});

describe('list endpoints read every server page', () => {
  it.each([
    ['devices', studyOperationsApi.endpoints.getStudyDevices],
    ['participants/ios/upload-status', studyOperationsApi.endpoints.getIosUploadStatus],
  ] as const)('reads every participant page of %s', async (path, endpoint) => {
    serve(
      `/chronicle/api/web/study/s1/${path}`,
      range(501).map((i) => [`p-${i}`, []]),
    );
    const result = (await read(endpoint, 's1')) as Record<string, unknown>;
    expect(Object.keys(result)).toHaveLength(501);
    expect(requested).toHaveLength(2);
  });

  it.each([
    ['api-keys', studyOperationsApi.endpoints.listStudyApiKeys],
    ['pending-enrollments', studyOperationsApi.endpoints.getPendingEnrollments],
  ] as const)('reads every page of %s', async (path, endpoint) => {
    serve(
      `/chronicle/api/web/study/s1/${path}`,
      range(501).map((i) => `row-${i}`),
    );
    expect(await read(endpoint, 's1')).toHaveLength(501);
    expect(requested).toHaveLength(2);
  });

  it('follows compliance participant offsets through empty and sparse violation pages', async () => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: routeFetch({
        'GET /chronicle/api/web/compliance/study/s1': (request) => {
          const url = new URL(request.url);
          requested.push(url.pathname + url.search);
          const offset = Number(url.searchParams.get('offset') ?? 0);
          return Response.json(offset === 0 ? {} : { s1: { 'p-501': [{ reason: 'NO_RECENT_DATA_UPLOADED' }] } }, {
            headers: offset === 0 ? { 'X-Next-Offset': '500' } : {},
          });
        },
      }),
      writable: true,
    });
    expect(await read(studyOperationsApi.endpoints.getComplianceViolations, 's1')).toEqual({
      s1: { 'p-501': [{ reason: 'NO_RECENT_DATA_UPLOADED' }] },
    });
    expect(requested).toHaveLength(2);
  });

  it('concatenates a participant device array split across bounded row pages', async () => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: routeFetch({
        'GET /chronicle/api/web/study/s1/devices': (request) => {
          const offset = Number(new URL(request.url).searchParams.get('offset') ?? 0);
          requested.push(request.url);
          return Response.json(
            { 'same-participant': [{ randomDeviceId: `device-${offset}` }] },
            {
              headers: offset === 0 ? { 'X-Next-Offset': '500' } : {},
            },
          );
        },
      }),
      writable: true,
    });
    expect(await read(studyOperationsApi.endpoints.getStudyDevices, 's1')).toEqual({
      'same-participant': [{ randomDeviceId: 'device-0' }, { randomDeviceId: 'device-500' }],
    });
    expect(requested).toHaveLength(2);
  });

  it.each(['0', '-1', '1.5', 'NaN', '9007199254740992'])('refuses invalid continuation %s', async (offset) => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: () => Promise.resolve(Response.json({}, { headers: { 'X-Next-Offset': offset } })),
      writable: true,
    });
    const failure = await read(studyOperationsApi.endpoints.getComplianceViolations, 's1').then(
      () => null,
      (error: unknown) => error,
    );
    // The message reaches the screen, so it comes from the catalog in the researcher's language.
    expect(failure).toMatchObject({ status: 'CUSTOM_ERROR', error: english.common.error_unreadable_response });
  });

  it('getStudyParticipants returns all 101 participants, not the first default page', async () => {
    serve(
      '/chronicle/api/web/study/s1/participants',
      range(101).map((i) => ({ participantId: `p-${i}`, participationStatus: 'ENROLLED' })),
    );
    const participants = (await read(studyOperationsApi.endpoints.getStudyParticipants, 's1')) as unknown[];
    expect(participants).toHaveLength(101);
  });

  it('getStudyParticipants walks past the 500-row maximum page', async () => {
    serve(
      '/chronicle/api/web/study/s1/participants',
      range(1201).map((i) => ({ participantId: `p-${i}`, participationStatus: 'ENROLLED' })),
    );
    const participants = (await read(studyOperationsApi.endpoints.getStudyParticipants, 's1')) as {
      participantId: string;
    }[];
    expect(participants.map((p) => p.participantId)).toEqual(range(1201).map((i) => `p-${i}`));
  });

  it('getAllStudies returns every study', async () => {
    serve(
      '/chronicle/api/web/study',
      range(150).map((i) => ({ id: `s-${i}`, title: `Study ${i}` })),
    );
    expect(await read(studyOperationsApi.endpoints.getAllStudies, undefined)).toHaveLength(150);
  });

  it('getParticipantStats merges every page of the stats map', async () => {
    serve(
      '/chronicle/api/web/study/s1/participants/stats',
      range(120).map((i) => [`p-${i}`, { participantId: `p-${i}` }]),
    );
    const stats = (await read(studyOperationsApi.endpoints.getParticipantStats, 's1')) as Record<string, unknown>;
    expect(Object.keys(stats)).toHaveLength(120);
  });

  it.each([
    ['participants/stats', studyOperationsApi.endpoints.getParticipantStats],
    ['participants/ios/upload-status', studyOperationsApi.endpoints.getIosUploadStatus],
  ] as const)('preserves a later-page error and sparse continuation for %s', async (path, endpoint) => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: routeFetch({
        [`GET /chronicle/api/web/study/s1/${path}`]: (request) => {
          const url = new URL(request.url);
          requested.push(url.pathname + url.search);
          return url.searchParams.get('offset') === '0'
            ? Response.json({ first: {} }, { headers: { 'X-Next-Offset': '777' } })
            : Response.json({ message: 'temporarily busy' }, { status: 503 });
        },
      }),
      writable: true,
    });
    const error = await read(endpoint, 's1').then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toEqual({ status: 503, data: { message: 'temporarily busy' } });
    expect(requested).toEqual([
      `/chronicle/api/web/study/s1/${path}?limit=500&offset=0`,
      `/chronicle/api/web/study/s1/${path}?limit=500&offset=777`,
    ]);
  });

  it.each([
    ['statistics', studyOperationsApi.endpoints.getParticipantStats],
    ['devices', studyOperationsApi.endpoints.getStudyDevices],
    ['upload status', studyOperationsApi.endpoints.getIosUploadStatus],
  ] as const)('keeps prototype-named IDs safe in participant %s maps', async (_name, endpoint) => {
    const participantIds = ['constructor', '__proto__', 'toString'];
    let body: Record<string, unknown> = {};
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: () => Promise.resolve(Response.json(body)),
      writable: true,
    });
    const store = createApiStore();
    type QueryResult = ReturnType<ReturnType<typeof endpoint.initiate>>;
    const request = store.dispatch<QueryResult>(endpoint.initiate('s1'));
    try {
      const empty = (await request.unwrap()) as Record<string, unknown>;
      expect(Object.getPrototypeOf(empty)).toBeNull();
      for (const id of participantIds) expect(empty[id]).toBeUndefined();

      body = Object.fromEntries(participantIds.map((id) => [id, { participantId: id }]));
      const refreshed = store.dispatch<QueryResult>(endpoint.initiate('s1', { forceRefetch: true }));
      const populated = (await refreshed.unwrap()) as Record<string, unknown>;
      expect(Object.getPrototypeOf(populated)).toBeNull();
      for (const id of participantIds) expect(populated[id]).toEqual({ participantId: id });
      refreshed.unsubscribe();
    } finally {
      request.unsubscribe();
      store.dispatch(studyOperationsApi.util.resetApiState());
    }
  });

  it('the settings audit trail reaches entries older than the first 200', async () => {
    serve(
      '/chronicle/api/web/study/s1/settings/audit',
      range(260).map((i) => ({ id: `a-${i}` })),
      { defaultLimit: 50, maxLimit: 200 },
    );
    expect(await read(studyOperationsApi.endpoints.getStudySettingsAudit, { studyId: 's1' })).toHaveLength(260);
  });

  it('collection acknowledgments reach entries older than the first 200', async () => {
    serve(
      '/chronicle/api/web/study/s1/settings/acknowledgments',
      range(230).map((i) => ({ id: `k-${i}` })),
      { defaultLimit: 50, maxLimit: 200 },
    );
    expect(await read(studyOperationsApi.endpoints.getStudyCollectionAcknowledgments, { studyId: 's1' })).toHaveLength(
      230,
    );
  });

  it('a page error fails the whole read instead of returning a silent partial list', async () => {
    let calls = 0;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: () => {
        calls += 1;
        const response =
          calls === 1
            ? new Response(JSON.stringify(range(500).map((i) => ({ participantId: `p-${i}` }))), {
                headers: { 'content-type': 'application/json' },
              })
            : new Response(JSON.stringify({ message: 'boom' }), {
                headers: { 'content-type': 'application/json' },
                status: 500,
              });
        return Promise.resolve(response);
      },
      writable: true,
    });
    const error = await read(studyOperationsApi.endpoints.getStudyParticipants, 's1').then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toMatchObject({ status: 500 });
  });

  it('rejects a full final page at the list-page cap', async () => {
    serve(
      '/chronicle/api/web/study/s1/participants',
      range(100_001).map((i) => ({ participantId: `p-${i}`, participationStatus: 'ENROLLED' })),
    );
    const error = await read(studyOperationsApi.endpoints.getStudyParticipants, 's1').then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).not.toBeNull();
    expect(requested).toHaveLength(200);
  });

  it('fails the participant query visibly when any row lacks participantId', async () => {
    serve('/chronicle/api/web/study/s1/participants', [
      { participantId: 'p-1', participationStatus: 'ENROLLED' },
      { participationStatus: 'ENROLLED' },
    ]);
    const error = await read(studyOperationsApi.endpoints.getStudyParticipants, 's1').then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toMatchObject({ status: 'CUSTOM_ERROR' });
    expect((error as { error: string }).error).toContain('participantId');
    expect(getErrorMessage(error, 'Failed to load participants')).toContain('contract error');
  });
});
