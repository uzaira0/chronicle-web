import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';

import { studyOperationsApi } from './study-operations-api';

// ai-built-code B1: the server pages every list (default page 100, max 500; audit and
// acknowledgments max 200). A study with more rows than one page must still show them all.

const SavedRequest = globalThis.Request;
// fetchBaseQuery builds `new Request('/chronicle/api/web/...')`; outside a browser a relative
// URL has no base, so resolve it against a dummy origin the way the page would.
class RelativeRequest extends SavedRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input, init);
  }
}

let savedFetch: typeof globalThis.fetch;
let savedDocument: typeof globalThis.document | undefined;
let requested: string[];

/** A server that pages `rows` the way the backend does: default and maximum page size, then offset. */
function serve(path: string, rows: unknown[], { defaultLimit = 100, maxLimit = 500 } = {}) {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
      requested.push(url.pathname + url.search);
      if (url.pathname !== path || (init?.method ?? 'GET') !== 'GET') {
        return Promise.resolve(new Response('nope', { status: 404 }));
      }
      const limit = Math.min(Number(url.searchParams.get('limit') ?? defaultLimit), maxLimit);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const page = rows.slice(offset, offset + limit);
      const body = Array.isArray(page[0]) ? Object.fromEntries(page as [string, unknown][]) : page;
      return Promise.resolve(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));
    },
    writable: true,
  });
}

async function read<T>(endpoint: { initiate: (arg: T) => unknown }, arg: T) {
  const store = configureStore({
    middleware: (getDefault) => getDefault().concat(studyOperationsApi.middleware),
    reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
  });
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
  Object.defineProperty(globalThis, 'Request', { configurable: true, value: RelativeRequest, writable: true });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'Request', { configurable: true, value: SavedRequest, writable: true });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: savedDocument, writable: true });
});

describe('list endpoints read every server page', () => {
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

  it('the exports list reaches exports older than the first page', async () => {
    serve(
      '/chronicle/api/web/study/s1/export',
      range(520).map((i) => ({ exportId: `e-${i}` })),
    );
    expect(await read(studyOperationsApi.endpoints.listStudyExports, { studyId: 's1' })).toHaveLength(520);
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
});
