import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import { getErrorMessage } from '@/lib/errors';
import { DOWNLOAD_TIMEOUT_MS } from '@/lib/request-timeout';
import { createApiStore } from '@/test/study-operations-store';

import { studyOperationsApi, toExportDateTime } from './study-operations-api';

type FetchCall = {
  init: RequestInit | undefined;
  input: RequestInfo | URL;
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

let savedDocument: typeof globalThis.document | undefined;
let savedFetch: typeof globalThis.fetch | undefined;
let savedUrl: typeof globalThis.URL;

function installDownloadDom(cookie = 'ol_csrf_token=csrf-value') {
  savedDocument = globalThis.document;
  savedUrl = globalThis.URL;

  const anchor = {
    click() {},
    download: '',
    href: '',
    remove() {},
  };
  const document = {
    body: {
      appendChild() {},
    },
    cookie,
    createElement(tag: string) {
      if (tag !== 'a') throw new Error(`unexpected element: ${tag}`);
      return anchor;
    },
  } as unknown as Document;

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: document,
    writable: true,
  });
  Object.defineProperty(globalThis, 'URL', {
    configurable: true,
    value: {
      ...savedUrl,
      createObjectURL: () => 'blob:chronicle-download',
      revokeObjectURL() {},
    },
    writable: true,
  });
}

function uninstallDownloadDom() {
  if (savedDocument !== undefined) {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: savedDocument,
      writable: true,
    });
  }
  Object.defineProperty(globalThis, 'URL', {
    configurable: true,
    value: savedUrl,
    writable: true,
  });
  savedDocument = undefined;
}

describe('downloadStudyExport', () => {
  beforeEach(() => {
    installDownloadDom();
    savedFetch = globalThis.fetch;
  });

  afterEach(() => {
    // Flush queued browser tasks before restoring the clock; Happy DOM groups zero-delay timers.
    if (jest.isFakeTimers()) jest.runOnlyPendingTimers();
    jest.useRealTimers();
    if (savedFetch) {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: savedFetch,
        writable: true,
      });
    }
    uninstallDownloadDom();
  });

  it('allows an export body to finish after the header deadline', async () => {
    // Let any existing browser timer batch finish before replacing its clock.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    jest.useFakeTimers();
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let signal: AbortSignal | null | undefined;
    let readingBody: () => void = () => {};
    const bodyStarted = new Promise<void>((resolve) => {
      readingBody = resolve;
    });
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal;
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          controller = streamController;
          signal?.addEventListener('abort', () => streamController.error(signal?.reason), { once: true });
        },
      });
      const response = new Response(body);
      const readBlob = response.blob.bind(response);
      response.blob = () => {
        readingBody();
        return readBlob();
      };
      return Promise.resolve(response);
    }) as typeof fetch;
    const store = createApiStore();
    const download = store.dispatch(
      studyOperationsApi.endpoints.downloadStudyExport.initiate({
        exportId: 'slow-export',
        format: 'CSV',
        studyId: 'study-1',
      }),
    );
    await bodyStarted;
    jest.advanceTimersByTime(DOWNLOAD_TIMEOUT_MS + 1);
    expect(signal?.aborted).toBe(false);
    controller?.enqueue(new TextEncoder().encode('csv'));
    controller?.close();
    await download.unwrap();
    store.dispatch(studyOperationsApi.util.resetApiState());
  });

  it('restores real browser timers after the export deadline check', async () => {
    expect(jest.isFakeTimers()).toBe(false);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  it('downloads with the authenticated session and CSRF token, without bearer download tokens', async () => {
    const calls: FetchCall[] = [];
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ init, input });
        return Promise.resolve(new Response(new Blob(['csv']), { status: 200 }));
      },
      writable: true,
    });
    const store = createApiStore();

    await store
      .dispatch(
        studyOperationsApi.endpoints.downloadStudyExport.initiate({
          exportId: 'export-123',
          format: 'CSV',
          studyId: 'study-456',
        }),
      )
      .unwrap();

    expect(calls).toHaveLength(1);
    const requestInput = calls[0]?.input;
    expect(requestInput).toBeDefined();
    expect(requestInput && requestUrl(requestInput)).toBe(
      '/chronicle/api/web/study/study-456/export/export-123/download',
    );
    expect(requestInput && requestUrl(requestInput)).not.toContain('token=');
    const headers = calls[0]?.init?.headers as Headers;
    expect(headers.has('X-Chronicle-Download-Token')).toBe(false);
    expect(headers.get('X-CSRF-Token')).toBe('csrf-value');
  });

  it.each([
    [
      'application/json',
      JSON.stringify({ message: 'Select at most 100 participants.' }),
      'Select at most 100 participants.',
    ],
    ['text/plain', 'Export expired; create a new export', 'Export expired; create a new export'],
    ['text/html', '<html><body>proxy failure</body></html>', 'Download failed (status 400)'],
  ])('displays safe download errors from %s responses', async (contentType, body, expected) => {
    globalThis.fetch = (() => {
      return Promise.resolve(
        new Response(body, {
          status: 400,
          headers: { 'content-type': contentType },
        }),
      );
    }) as unknown as typeof fetch;
    const store = createApiStore();
    const result = await store.dispatch(
      studyOperationsApi.endpoints.downloadParticipantData.initiate({
        studyId: 'study-1',
        participantIds: ['p1'],
        dataType: 'DeviceSettings',
        startDate: '2026-10-05',
        endDate: '2026-10-06',
      }),
    );
    expect(getErrorMessage(result.error, 'Download failed')).toBe(expected);
    store.dispatch(studyOperationsApi.util.resetApiState());
  });

  it('downloads questionnaire responses from the backend data route as CSV', async () => {
    const calls: FetchCall[] = [];
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ init, input });
        return Promise.resolve(new Response(new Blob(['csv']), { status: 200 }));
      },
      writable: true,
    });
    const store = createApiStore();

    await store
      .dispatch(
        studyOperationsApi.endpoints.downloadQuestionnaireResponses.initiate({
          questionnaireId: 'questionnaire/1',
          studyId: 'study/1',
        }),
      )
      .unwrap();

    expect(calls).toHaveLength(1);
    const requestInput = calls[0]?.input;
    expect(requestInput).toBeDefined();
    expect(requestInput && requestUrl(requestInput)).toBe(
      '/chronicle/v3/survey/study%2F1/questionnaire/questionnaire%2F1/data?type=csv',
    );
  });

  it.each([
    { endpoint: studyOperationsApi.endpoints.downloadParticipantData, prefix: '/chronicle/api/web/study' },
    { endpoint: studyOperationsApi.endpoints.downloadParticipantTudData, prefix: '/chronicle/v3/time-use-diary' },
  ])('downloads participant data from $prefix with the same local-day boundaries', async ({ endpoint, prefix }) => {
    const calls: FetchCall[] = [];
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return Promise.resolve(new Response('csv', { status: 200 }));
    }) as typeof fetch;
    const store = createApiStore();
    await store
      .dispatch(
        endpoint.initiate({
          studyId: 'study/1',
          participantIds: ['p/1', 'p2'],
          dataType: 'DayTime',
          startDate: '2026-10-05',
          endDate: '2026-10-06',
        }),
      )
      .unwrap();
    expect(calls).toHaveLength(1);
    const url = new savedUrl(requestUrl(calls[0]?.input ?? ''), 'http://localhost');
    expect(url.pathname).toBe(`${prefix}/study%2F1/participants/data`);
    expect(url.searchParams.getAll('participantId')).toEqual(['p/1', 'p2']);
    expect(url.searchParams.get('startDate')).toBe(toExportDateTime('2026-10-05'));
    expect(url.searchParams.get('endDate')).toBe(toExportDateTime('2026-10-06', true));
    expect(url.searchParams.get('dataType')).toBe('DayTime');
    expect(calls[0]?.init?.signal).toBeDefined();
    store.dispatch(studyOperationsApi.util.resetApiState());
  });
});
