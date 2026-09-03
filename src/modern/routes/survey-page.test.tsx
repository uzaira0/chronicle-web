import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

type FrequencyHookState = {
  data: { appUsageFrequency: 'DAILY' | 'HOURLY' } | undefined;
  isLoading: boolean;
};

const frequencyHookState: FrequencyHookState = {
  data: undefined,
  isLoading: false,
};

await mock.module('@/components/participant-hourly-survey-form', () => ({
  ParticipantHourlySurveyForm: ({
    date,
    participantId,
    studyId,
  }: {
    date: string;
    participantId: string;
    studyId: string;
  }) => <div data-testid="hourly-survey-form">{`${studyId}|${participantId}|${date}`}</div>,
}));

await mock.module('@/components/participant-landing-card', () => ({
  ParticipantLandingCard: ({
    extraParams,
    title,
  }: {
    extraParams?: Array<{ key: string; label: string }>;
    title: string;
  }) => (
    <div data-testid="participant-landing-card">
      <span>{title}</span>
      <span>{extraParams?.map(({ label }) => label).join(', ')}</span>
    </div>
  ),
}));

await mock.module('@/components/participant-survey-form', () => ({
  ParticipantSurveyForm: ({
    date,
    participantId,
    studyId,
  }: {
    date: string;
    participantId: string;
    studyId: string;
  }) => <div data-testid="daily-survey-form">{`${studyId}|${participantId}|${date}`}</div>,
}));

await mock.module('@/state/study-operations-api', () => ({
  useGetAppUsageFrequencyQuery: () => frequencyHookState,
}));

import { LanguageProvider } from '@/i18n';

import { SurveyRoutePage } from './survey-page';

function renderRoute(search = '') {
  return render(
    <LanguageProvider initialSearch={search}>
      <MemoryRouter initialEntries={[`/survey${search}`]}>
        <SurveyRoutePage />
      </MemoryRouter>
    </LanguageProvider>,
  );
}

describe('SurveyRoutePage', () => {
  beforeEach(() => {
    frequencyHookState.data = undefined;
    frequencyHookState.isLoading = false;
  });

  test('renders the participant landing card when the link is incomplete', () => {
    renderRoute('?studyId=study-1&participantId=participant-1');

    expect(screen.getByTestId('participant-landing-card')).toBeTruthy();
    expect(screen.getByText('App Usage Survey')).toBeTruthy();
    expect(screen.getByText('Survey date')).toBeTruthy();
  });

  test('shows a loading state while the survey frequency is resolving for a complete link', () => {
    frequencyHookState.isLoading = true;

    renderRoute('?studyId=study-1&participantId=participant-1&date=2026-06-24');

    expect(screen.getByText('Loading the survey…')).toBeTruthy();
    expect(screen.queryByTestId('daily-survey-form')).toBeNull();
    expect(screen.queryByTestId('hourly-survey-form')).toBeNull();
  });

  test('translates the route chrome from ?lang= using the verified upstream tables', () => {
    renderRoute('?studyId=study-1&participantId=participant-1&lang=es');
    expect(screen.getByText('Encuesta de uso de las Apps')).toBeTruthy();
  });

  test('renders the hourly survey form when the study is configured for hourly app usage', () => {
    frequencyHookState.data = { appUsageFrequency: 'HOURLY' };

    renderRoute('?studyId=study-1&participantId=participant-1&date=2026-06-24');

    expect(screen.getByTestId('hourly-survey-form').textContent).toBe('study-1|participant-1|2026-06-24');
    expect(screen.queryByTestId('daily-survey-form')).toBeNull();
  });

  test('renders the daily survey form when the study is explicitly configured for daily app usage', () => {
    frequencyHookState.data = { appUsageFrequency: 'DAILY' };

    renderRoute('?studyId=study-1&participantId=participant-1&date=2026-06-24');

    expect(screen.getByTestId('daily-survey-form').textContent).toBe('study-1|participant-1|2026-06-24');
    expect(screen.queryByTestId('hourly-survey-form')).toBeNull();
  });

  test('falls back to the daily survey form when the frequency lookup is unavailable', () => {
    renderRoute('?studyId=study-1&participantId=participant-1&date=2026-06-24');

    expect(screen.getByTestId('daily-survey-form').textContent).toBe('study-1|participant-1|2026-06-24');
    expect(screen.queryByTestId('hourly-survey-form')).toBeNull();
  });
});
