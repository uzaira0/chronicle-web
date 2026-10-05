import { afterEach, describe, expect, test } from 'bun:test';
import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';

import { LanguageProvider } from '@/i18n';
import { studyOperationsApi } from '@/state/study-operations-api';

import { ParticipantHourlySurveyForm } from './participant-hourly-survey-form';
import { ParticipantQuestionnaireForm } from './participant-questionnaire-form';
import { ParticipantSurveyForm } from './participant-survey-form';

const savedFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
});

function serve(body: unknown) {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: () =>
      Promise.resolve(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })),
    writable: true,
  });
}

function renderForm(form: ReactNode) {
  window.location.href = 'http://localhost/';
  const store = configureStore({
    middleware: (getDefault) => getDefault().concat(studyOperationsApi.middleware),
    reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
  });
  render(
    <Provider store={store}>
      <LanguageProvider initialSearch="">{form}</LanguageProvider>
    </Provider>,
  );
}

function leaveIsBlocked() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const youtube = {
  appLabel: 'YouTube',
  appPackageName: 'com.google.android.youtube',
  eventType: 1,
  timestamp: '2026-06-01T10:00:00.000Z',
  timezone: 'UTC',
  users: [],
};

describe('participant forms ask before a reload drops entered answers', () => {
  test('questionnaire', async () => {
    serve({ id: 'q1', questions: [{ choices: ['Daily', 'Never'], title: 'How often?' }], title: 'Habits' });
    renderForm(<ParticipantQuestionnaireForm participantId="p1" questionnaireId="q1" studyId="s1" />);
    fireEvent.click(await screen.findByLabelText('Daily'));
    expect(leaveIsBlocked()).toBe(true);
  });

  test('daily app-usage survey', async () => {
    serve([youtube]);
    renderForm(<ParticipantSurveyForm date="2026-06-01" participantId="p1" studyId="s1" />);
    expect(leaveIsBlocked()).toBe(false);
    fireEvent.click(await screen.findByLabelText('Child alone'));
    expect(leaveIsBlocked()).toBe(true);
  });

  test('hourly app-usage survey', async () => {
    serve([youtube]);
    renderForm(<ParticipantHourlySurveyForm date="2026-06-01" participantId="p1" studyId="s1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Begin Survey' }));
    expect(leaveIsBlocked()).toBe(false);
    fireEvent.click(screen.getByLabelText('YouTube'));
    expect(leaveIsBlocked()).toBe(true);
  });
});
