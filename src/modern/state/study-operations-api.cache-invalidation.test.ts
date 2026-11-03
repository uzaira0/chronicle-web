import { afterEach, expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { COLLECTION_MODULE_ID } from '@/generated/chronicle-contracts';
import savedQuestionnaire from '@/test/golden/backend-questionnaire.json';
import { routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';
import { studyOperationsApi } from './study-operations-api';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test.each([COLLECTION_MODULE_ID.questionnaire, 'pending enrollment', 'enrollment access code'] as const)(
  '%s mutation refreshes only the subscribed study',
  async (resource) => {
    const app = createApiStore();
    const { endpoints } = studyOperationsApi;
    const scenario =
      resource === COLLECTION_MODULE_ID.questionnaire
        ? {
            path: (id: string) => `/chronicle/api/web/survey/${id}/questionnaire`,
            initial: [savedQuestionnaire],
            mutation: `DELETE /chronicle/api/web/survey/study/questionnaire/${savedQuestionnaire.id}`,
            subscribe: (id: string) => app.dispatch(endpoints.getStudyQuestionnaires.initiate(id)),
            remove: () =>
              app.dispatch(
                endpoints.deleteQuestionnaire.initiate({ studyId: 'study', questionnaireId: savedQuestionnaire.id }),
              ),
            select: () => endpoints.getStudyQuestionnaires.select('study')(app.getState()),
          }
        : {
            path: (id: string) => `/chronicle/api/web/study/${id}/pending-enrollments`,
            initial: ['participant'],
            mutation:
              resource === 'enrollment access code'
                ? 'POST /chronicle/api/web/study/study/participant/participant/form-access-codes'
                : 'POST /chronicle/api/web/study/study/participant/participant/pending-enrollment/cancel',
            subscribe: (id: string) => app.dispatch(endpoints.getPendingEnrollments.initiate(id)),
            remove: () =>
              resource === 'enrollment access code'
                ? app.dispatch(
                    endpoints.issueParticipantAccessCode.initiate({
                      studyId: 'study',
                      participantId: 'participant',
                      formKind: 'ENROLLMENT',
                    }),
                  )
                : app.dispatch(
                    endpoints.cancelPendingEnrollment.initiate({ studyId: 'study', participantId: 'participant' }),
                  ),
            select: () => endpoints.getPendingEnrollments.select('study')(app.getState()),
          };
    let removed = false;
    const reads = new Map<string, number>();
    globalThis.fetch = routeFetch({
      ...Object.fromEntries(
        ['study', 'other-study'].map((id) => [
          `GET ${scenario.path(id)}`,
          () => {
            reads.set(id, (reads.get(id) ?? 0) + 1);
            return Response.json(removed && id === 'study' ? [] : scenario.initial);
          },
        ]),
      ),
      [scenario.mutation]: () => {
        removed = true;
        return Response.json({});
      },
    });
    const subscriptions = ['study', 'other-study'].map((id) => scenario.subscribe(id));
    try {
      await Promise.all(subscriptions.map((subscription) => subscription.unwrap()));
      expect(scenario.select().data).toHaveLength(1);
      await scenario.remove().unwrap();
      await waitFor(() => expect(scenario.select().data).toEqual([]));
      expect(reads.get('study')).toBe(2);
      expect(reads.get('other-study')).toBe(1);
    } finally {
      for (const subscription of subscriptions) subscription.unsubscribe();
      app.dispatch(studyOperationsApi.util.resetApiState());
    }
  },
);
