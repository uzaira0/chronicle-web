import { afterEach, beforeEach, expect, it, spyOn } from 'bun:test';
import { getErrorMessage } from '@/lib/errors';
import { toSyncExportSelection } from '@/lib/sync-export-selection';
import { installRelativeRequest } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';
import { studyOperationsApi } from './study-operations-api';

beforeEach(() => {
  window.location.href = 'http://localhost/';
});

const savedFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = savedFetch;
});

it.each(['access-code', 'compliance', 'limits'])(
  'classifies unreadable %s responses after HTTP success',
  async (endpoint) => {
    globalThis.fetch = (() => Promise.resolve(new Response('not-json', { status: 200 }))) as unknown as typeof fetch;
    const store = createApiStore();
    const operation =
      endpoint === 'access-code'
        ? store.dispatch(
            studyOperationsApi.endpoints.issueParticipantAccessCode.initiate({
              formKind: 'APP_USAGE',
              participantId: 'p1',
              studyId: 'study-1',
            }),
          )
        : endpoint === 'compliance'
          ? store.dispatch(studyOperationsApi.endpoints.getComplianceViolations.initiate('study-1'))
          : store.dispatch(studyOperationsApi.endpoints.getStudyLimits.initiate('study-1'));
    const result = await operation;
    expect(result.error).toMatchObject({ status: 'PARSING_ERROR' });
    expect(getErrorMessage(result.error, 'Request failed')).toBe(
      'The server returned an unreadable response. Contact the study team or server operator.',
    );
    store.dispatch(studyOperationsApi.util.resetApiState());
  },
);

it('preserves the supported empty limits response', async () => {
  globalThis.fetch = (() => Promise.resolve(new Response('', { status: 200 }))) as unknown as typeof fetch;
  const store = createApiStore();
  expect(await store.dispatch(studyOperationsApi.endpoints.getStudyLimits.initiate('study-1')).unwrap()).toEqual({});
  store.dispatch(studyOperationsApi.util.resetApiState());
});

// A dropped connection on the study page's own reads and the limits save is a network failure the page explains
// (check the connection), never an unhandled rejection or a misleading server error.
it.each([
  [
    'study limits',
    (store: ReturnType<typeof createApiStore>) =>
      store.dispatch(studyOperationsApi.endpoints.getStudyLimits.initiate('study-1')),
  ],
  [
    'study lifecycle',
    (store: ReturnType<typeof createApiStore>) =>
      store.dispatch(studyOperationsApi.endpoints.getStudyLifecycleStatus.initiate('study-1')),
  ],
  [
    'the limits save',
    (store: ReturnType<typeof createApiStore>) =>
      store.dispatch(
        studyOperationsApi.endpoints.setStudyLimits.initiate({ studyId: 'study-1', limits: { durationDays: 30 } }),
      ),
  ],
] as const)('a dropped connection on %s is reported as a network failure', async (_name, start) => {
  globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
  const store = createApiStore();
  const result = await start(store);
  expect(result.error).toMatchObject({ status: 'FETCH_ERROR' });
  expect(getErrorMessage(result.error, 'Request failed')).toContain('could not reach the server');
  store.dispatch(studyOperationsApi.util.resetApiState());
});

// The participant diagnostics panel narrows the server's history by query string: each filter reaches the server
// under its API name, blank ones are left out (a blank device id must not match "no device"), and ids are encoded.
it('sends participant diagnostics filters as query parameters and omits blank ones', async () => {
  const restoreRequest = installRelativeRequest();
  const urls: URL[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    urls.push(new URL(input instanceof Request ? input.url : String(input), 'http://localhost'));
    return Promise.resolve(Response.json({ items: [], nextCursor: null }));
  }) as unknown as typeof fetch;
  const store = createApiStore();
  try {
    await store
      .dispatch(
        studyOperationsApi.endpoints.getAndroidDiagnostics.initiate({
          studyId: 'study 1/ñ',
          participantId: 'p-1',
          randomDeviceId: '',
          fromDay: '2026-09-01',
          toDay: '2026-09-30',
          moduleFamily: 'USAGE_LIFECYCLE',
          cursor: 'page-2',
          limit: 25,
        }),
      )
      .unwrap();
    expect(urls).toHaveLength(1);
    expect(urls[0]?.pathname).toBe(
      `/chronicle/api/web/study/${encodeURIComponent('study 1/ñ')}/participants/android/diagnostics`,
    );
    expect(Object.fromEntries(urls[0]?.searchParams ?? [])).toEqual({
      participantId: 'p-1',
      from: '2026-09-01',
      to: '2026-09-30',
      moduleFamily: 'USAGE_LIFECYCLE',
      cursor: 'page-2',
      limit: '25',
    });
  } finally {
    store.dispatch(studyOperationsApi.util.resetApiState());
    restoreRequest();
  }
});

function selection(ids: string[]) {
  const selected = toSyncExportSelection(ids);
  if (!selected) throw new Error('empty selection');
  return selected;
}

function submittedForms() {
  const forms: { action: string; fields: Record<string, string> }[] = [];
  const submit = spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
    const fields = Object.fromEntries(
      [...this.querySelectorAll('input')].map((input) => [input.name, input.value] as const),
    );
    forms.push({ action: new URL(this.action, window.location.origin).pathname, fields });
  });
  return { forms, submit };
}

it.each([
  ['2026-04-05', '2026-04-05', '2026-04-05T00:00:00.000-04:00', '2026-04-06T00:00:00.000-04:00'],
  ['2026-09-06', '2026-09-06', '2026-09-06T01:00:00.000-03:00', '2026-09-07T00:00:00.000-03:00'],
])(
  'posts one native form whose %s..%s days are the study zone across a clock change',
  async (startDate, endDate, start, end) => {
    const fetched = spyOn(globalThis, 'fetch');
    const { forms, submit } = submittedForms();
    const store = createApiStore();
    try {
      await store
        .dispatch(
          studyOperationsApi.endpoints.downloadParticipantData.initiate({
            dataType: 'UploadDiagnostics',
            participantIds: selection(['p1', 'p2']),
            studyId: 's1',
            startDate,
            endDate,
            timeZone: 'America/Santiago',
          }),
        )
        .unwrap();
      expect(fetched).not.toHaveBeenCalled();
      expect(forms).toHaveLength(1);
      expect(forms[0]?.action).toBe('/chronicle/api/web/study/s1/participants/data');
      expect(forms[0]?.fields).toMatchObject({ dataType: 'UploadDiagnostics', startDate: start, endDate: end });
    } finally {
      fetched.mockRestore();
      submit.mockRestore();
      store.dispatch(studyOperationsApi.util.resetApiState());
    }
  },
);

it('reports browser download refusal in the mutation', async () => {
  const create = spyOn(document, 'createElement').mockImplementation(() => {
    throw new TypeError('Browser blocked');
  });
  const store = createApiStore();
  try {
    const result = await store.dispatch(
      studyOperationsApi.endpoints.downloadParticipantData.initiate({
        dataType: 'UsageEvents',
        participantIds: selection(['p1']),
        studyId: 's1',
        timeZone: 'UTC',
      }),
    );
    expect(result.error).toMatchObject({ status: 'CUSTOM_ERROR' });
  } finally {
    create.mockRestore();
    store.dispatch(studyOperationsApi.util.resetApiState());
  }
});
