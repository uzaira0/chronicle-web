import { afterEach, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { ParticipantHourlySurveyForm } from '@/components/participant-hourly-survey-form';
import { ParticipantQuestionnaireForm } from '@/components/participant-questionnaire-form';
import { ParticipantSurveyForm } from '@/components/participant-survey-form';
import { studyOperationsApi } from '@/state/study-operations-api';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

test.each(['questionnaire', 'daily', 'hourly'] as const)('retries a failed %s instrument read', async (kind) => {
  const restoreRequest = installRelativeRequest();
  const store = createApiStore();
  const questionnaire = kind === 'questionnaire';
  let requests = 0;
  const path = questionnaire ? '/survey/s1/questionnaire/q1' : '/survey/s1/participant/p1/app-usage';
  globalThis.fetch = routeFetch({
    [`GET /chronicle/v3${path}`]: () => {
      requests++;
      if (requests === 1) throw new TypeError('offline');
      return Response.json(
        questionnaire
          ? { id: 'q1', title: 'Daily check', questions: [{ title: 'How are you?', choices: [] }] }
          : { apps: [], date: '2026-10-18', state: 'UNANSWERED', timeZone: 'UTC' },
      );
    },
  });
  try {
    const props = { studyId: 's1', participantId: 'p1', date: '2026-10-18' };
    render(
      <Provider store={store}>
        {questionnaire ? (
          <ParticipantQuestionnaireForm {...props} questionnaireId="q1" />
        ) : kind === 'daily' ? (
          <ParticipantSurveyForm {...props} />
        ) : (
          <ParticipantHourlySurveyForm {...props} />
        )}
      </Provider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(requests).toBe(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull());
    if (questionnaire) expect(await screen.findByText('How are you?')).toBeTruthy();
  } finally {
    cleanup();
    store.dispatch(studyOperationsApi.util.resetApiState());
    restoreRequest();
  }
});
