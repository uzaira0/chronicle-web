import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { installRelativeRequest } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';

import { studyOperationsApi } from './study-operations-api';

// A self-host participant listener serves /chronicle/v3 and refuses /chronicle/api/web, so
// every participant-form call must use the public prefix (researcher calls keep api/web).

let restoreRequest: () => void;

let savedFetch: typeof globalThis.fetch;
let savedDocument: typeof globalThis.document | undefined;
let requested: string[];

async function call<T>(endpoint: { initiate: (arg: T) => unknown }, arg: T) {
  const store = createApiStore();
  const request: { unwrap: () => Promise<unknown>; unsubscribe?: () => void } = store.dispatch(
    endpoint.initiate(arg) as never,
  );
  await request.unwrap().catch(() => undefined);
  request.unsubscribe?.();
}

beforeEach(() => {
  requested = [];
  savedFetch = globalThis.fetch;
  savedDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: '' }, writable: true });
  restoreRequest = installRelativeRequest();
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: (input: RequestInfo | URL) => {
      requested.push(new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname);
      return Promise.resolve(new Response('{}', { headers: { 'content-type': 'application/json' } }));
    },
    writable: true,
  });
});

afterEach(() => {
  restoreRequest();
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: savedDocument, writable: true });
});

describe('participant form routes', () => {
  const studyId = 's1';
  const participantId = 'p1';
  const { endpoints } = studyOperationsApi;

  it('send every participant-form call to /chronicle/v3', async () => {
    await call(endpoints.getParticipantQuestionnaire, { questionnaireId: 'q1', studyId });
    await call(endpoints.submitQuestionnaireResponses, {
      participantId,
      questionnaireId: 'q1',
      responses: [],
      studyId,
    });
    await call(endpoints.getTimeUseDiarySettings, studyId);
    await call(endpoints.submitTimeUseDiary, { data: [], participantId, studyId });
    await call(endpoints.getAppUsageFrequency, studyId);
    await call(endpoints.getAppUsageSurveyData, { endDate: 'e', participantId, startDate: 's', studyId });
    await call(endpoints.submitAppUsageSurvey, { data: [], participantId, studyId });
    expect(requested).toEqual([
      '/chronicle/v3/survey/s1/questionnaire/q1',
      '/chronicle/v3/survey/s1/participant/p1/questionnaire/q1',
      '/chronicle/v3/time-use-diary/s1/settings',
      '/chronicle/v3/time-use-diary/s1/participant/p1',
      '/chronicle/v3/survey/s1/app-usage-frequency',
      '/chronicle/v3/survey/s1/participant/p1/app-usage',
      '/chronicle/v3/survey/s1/participant/p1/app-usage',
    ]);
  });

  it('keep researcher calls on /chronicle/api/web', async () => {
    await call(endpoints.getStudyLifecycleStatus, studyId);
    expect(requested).toEqual(['/chronicle/api/web/study/s1/lifecycle']);
  });

  it.each([
    'id with spaces',
    'id/with/slashes',
    'id?with=query#hash',
    'unicode-é',
    'id%20encoded',
  ])('encodes %s in real study requests', async (studyId) => {
    await call(endpoints.getStudySummary, studyId);
    await call(endpoints.getStudyDevices, studyId);
    await call(endpoints.getStudySettingsAudit, { studyId });
    const prefix = `/chronicle/api/web/study/${encodeURIComponent(studyId)}`;
    expect(requested).toEqual([prefix, `${prefix}/devices`, `${prefix}/settings/audit`]);
  });
});
