import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { PARTICIPANT_FORM_DATE_HEADER } from '@/generated/chronicle-contracts';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';

import { studyOperationsApi } from './study-operations-api';

// A self-host participant listener serves /chronicle/v3 and refuses /chronicle/api/web, so
// every participant-form call must use the public prefix (researcher calls keep api/web).

let restoreRequest: () => void;

let savedFetch: typeof globalThis.fetch;
let savedDocument: typeof globalThis.document | undefined;
const FORM_DAY = '2026-10-06';
let requested: string[];
let submissionDays: string[];

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
  submissionDays = [];
  savedFetch = globalThis.fetch;
  savedDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: '' }, writable: true });
  restoreRequest = installRelativeRequest();
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: routeFetch(
      Object.fromEntries(
        [
          'GET /chronicle/v3/survey/s1/questionnaire/q1',
          'POST /chronicle/v3/survey/s1/participant/p1/questionnaire/q1',
          'GET /chronicle/v3/time-use-diary/s1/settings',
          'POST /chronicle/v3/time-use-diary/s1/participant/p1',
          'GET /chronicle/v3/survey/s1/app-usage-frequency',
          'GET /chronicle/v3/survey/s1/participant/p1/app-usage/days',
          'GET /chronicle/v3/survey/s1/participant/p1/app-usage',
          'POST /chronicle/v3/survey/s1/participant/p1/app-usage',
          'GET /chronicle/api/web/study/s1/lifecycle',
          ...['id with spaces', 'id/with/slashes', 'id?with=query#hash', 'unicode-é', 'id%20encoded'].flatMap(
            (studyId) =>
              ['', '/devices', '/settings/audit'].map(
                (suffix) => `GET /chronicle/api/web/study/${encodeURIComponent(studyId)}${suffix}`,
              ),
          ),
        ].map((key) => [
          key,
          (request: Request) => {
            requested.push(new URL(request.url).pathname);
            const day = request.headers.get(PARTICIPANT_FORM_DATE_HEADER);
            if (day) submissionDays.push(day);
            return Response.json({});
          },
        ]),
      ),
    ),
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
      logicalDate: FORM_DAY,
      participantId,
      questionnaireId: 'q1',
      responses: [],
      studyId,
    });
    await call(endpoints.getTimeUseDiarySettings, studyId);
    await call(endpoints.submitTimeUseDiary, { data: [], participantId, studyId, logicalDate: FORM_DAY });
    await call(endpoints.getAppUsageFrequency, studyId);
    await call(endpoints.getAppUsageSurveyDays, { participantId, studyId });
    await call(endpoints.getAppUsageDaySurvey, { date: FORM_DAY, participantId, studyId });
    await call(endpoints.submitAppUsageSurvey, { answers: [], date: FORM_DAY, participantId, studyId });
    // The survey names its day in the request; its session is not bound to a day.
    expect(submissionDays).toEqual([FORM_DAY, FORM_DAY]);
    expect(requested).toEqual([
      '/chronicle/v3/survey/s1/questionnaire/q1',
      '/chronicle/v3/survey/s1/participant/p1/questionnaire/q1',
      '/chronicle/v3/time-use-diary/s1/settings',
      '/chronicle/v3/time-use-diary/s1/participant/p1',
      '/chronicle/v3/survey/s1/app-usage-frequency',
      '/chronicle/v3/survey/s1/participant/p1/app-usage/days',
      '/chronicle/v3/survey/s1/participant/p1/app-usage',
      '/chronicle/v3/survey/s1/participant/p1/app-usage',
    ]);
  });

  it('keep researcher calls on /chronicle/api/web', async () => {
    await call(endpoints.getStudyLifecycleStatus, studyId);
    expect(requested).toEqual(['/chronicle/api/web/study/s1/lifecycle']);
  });

  it.each(['id with spaces', 'id/with/slashes', 'id?with=query#hash', 'unicode-é', 'id%20encoded'])(
    'encodes %s in real study requests',
    async (studyId) => {
      await call(endpoints.getStudySummary, studyId);
      await call(endpoints.getStudyDevices, studyId);
      await call(endpoints.getStudySettingsAudit, { studyId });
      const prefix = `/chronicle/api/web/study/${encodeURIComponent(studyId)}`;
      expect(requested).toEqual([prefix, `${prefix}/devices`, `${prefix}/settings/audit`]);
    },
  );
});
