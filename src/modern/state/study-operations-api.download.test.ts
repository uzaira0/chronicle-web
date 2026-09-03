import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';

import { studyOperationsApi } from './study-operations-api';

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
    if (savedFetch) {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: savedFetch,
        writable: true,
      });
    }
    uninstallDownloadDom();
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
    const store = configureStore({
      reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(studyOperationsApi.middleware),
    });

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
    const store = configureStore({
      reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(studyOperationsApi.middleware),
    });

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
});
