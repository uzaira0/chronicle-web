import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';

import { studyOperationsApi } from './study-operations-api';

let savedDocumentDescriptor: PropertyDescriptor | undefined;
let savedFetch: typeof globalThis.fetch;

function createApiStore() {
  return configureStore({
    reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(studyOperationsApi.middleware),
  });
}

function installFetch(response: () => Response) {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: () => Promise.resolve(response()),
    writable: true,
  });
}

describe('getStudyLifecycleStatus wire validation', () => {
  beforeEach(() => {
    savedDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    savedFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { cookie: '' },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: savedFetch,
      writable: true,
    });
    if (savedDocumentDescriptor) {
      Object.defineProperty(globalThis, 'document', savedDocumentDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'document');
    }
  });

  it('accepts the backend lifecycle response as a bare JSON status', async () => {
    installFetch(
      () =>
        new Response(JSON.stringify('ACTIVE'), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
    );
    const store = createApiStore();
    const request = store.dispatch(studyOperationsApi.endpoints.getStudyLifecycleStatus.initiate('bare-status'));

    expect(await request.unwrap()).toBe('ACTIVE');
    request.unsubscribe();
  });

  it('accepts a recognized lifecycle status envelope for compatibility', async () => {
    installFetch(
      () =>
        new Response(JSON.stringify({ status: 'ARCHIVED' }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
    );
    const store = createApiStore();
    const request = store.dispatch(studyOperationsApi.endpoints.getStudyLifecycleStatus.initiate('known-status'));

    expect(await request.unwrap()).toBe('ARCHIVED');
    request.unsubscribe();
  });

  it('rejects an unrecognized lifecycle status instead of treating it as active', async () => {
    installFetch(
      () =>
        new Response(JSON.stringify({ status: 'FUTURE_STATUS' }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
    );
    const store = createApiStore();
    const request = store.dispatch(studyOperationsApi.endpoints.getStudyLifecycleStatus.initiate('unknown-status'));

    const result = await request;
    request.unsubscribe();
    expect(result).toMatchObject({
      error: {
        error: 'The study lifecycle response contained an unrecognized status.',
        status: 'PARSING_ERROR',
      },
    });
  });

  it('rejects malformed JSON instead of treating it as active', async () => {
    installFetch(() => new Response('{', { headers: { 'content-type': 'application/json' }, status: 200 }));
    const store = createApiStore();
    const request = store.dispatch(studyOperationsApi.endpoints.getStudyLifecycleStatus.initiate('malformed-json'));

    const result = await request;
    request.unsubscribe();
    expect(result).toMatchObject({
      error: {
        error: 'The study lifecycle response was not valid JSON.',
        status: 'PARSING_ERROR',
      },
    });
  });

  it('retains cached ACTIVE data but marks a success-to-invalid refetch as failed', async () => {
    let responseStatus = 'ACTIVE';
    installFetch(
      () =>
        new Response(JSON.stringify(responseStatus), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
    );
    const store = createApiStore();
    const firstRequest = store.dispatch(studyOperationsApi.endpoints.getStudyLifecycleStatus.initiate('cached-active'));
    expect(await firstRequest.unwrap()).toBe('ACTIVE');
    firstRequest.unsubscribe();

    responseStatus = 'FUTURE_STATUS';
    const refetch = store.dispatch(
      studyOperationsApi.endpoints.getStudyLifecycleStatus.initiate('cached-active', { forceRefetch: true }),
    );
    const refetchResult = await refetch;
    refetch.unsubscribe();

    expect(refetchResult).toMatchObject({
      data: 'ACTIVE',
      error: {
        status: 'PARSING_ERROR',
      },
      isError: true,
    });
    expect(
      studyOperationsApi.endpoints.getStudyLifecycleStatus.select('cached-active')(store.getState()),
    ).toMatchObject({
      data: 'ACTIVE',
      error: {
        status: 'PARSING_ERROR',
      },
      isError: true,
    });
  });
});
