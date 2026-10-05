import { beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

type FrequencyHookState = {
  data: { appUsageFrequency: 'DAILY' | 'HOURLY' } | undefined;
  isLoading: boolean;
  isError: boolean;
};

let retryCalls = 0;
const retryFrequency = () => { retryCalls++; frequencyHookState.data = { appUsageFrequency: 'HOURLY' }; frequencyHookState.isError = false; };

const frequencyHookState: FrequencyHookState = {
  data: undefined,
  isLoading: false,
  isError: false,
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
  useGetAppUsageFrequencyQuery: () => ({ ...frequencyHookState, isSuccess: !frequencyHookState.isLoading && !frequencyHookState.isError, refetch: retryFrequency }),
}));

import { LanguageProvider } from '@/i18n';
import { localDay } from '@/lib/format';

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
    frequencyHookState.isError = false;
    retryCalls = 0;
  });

  test('renders the participant landing card when the link is incomplete', () => {
    renderRoute('?studyId=study-1');

    expect(screen.getByTestId('participant-landing-card')).toBeTruthy();
    expect(screen.getByText('App Usage Survey')).toBeTruthy();
    expect(screen.getByText('Survey date')).toBeTruthy();
  });

  test('opens today on the participant clock for a reminder link without a date', () => {
    renderRoute('?studyId=study-1&participantId=participant-1');

    expect(screen.getByTestId('daily-survey-form').textContent).toBe(`study-1|participant-1|${localDay(new Date())}`);
  });

  test('keeps the dateless survey on the day it opened when a rerender crosses midnight', () => {
    setSystemTime(new Date(2026, 9, 2, 23, 59));
    try {
      const view = renderRoute('?studyId=study-1&participantId=participant-1');
      setSystemTime(new Date(2026, 9, 3, 0, 1));
      frequencyHookState.data = { appUsageFrequency: 'DAILY' };
      view.rerender(
        <LanguageProvider initialSearch="?studyId=study-1&participantId=participant-1">
          <MemoryRouter initialEntries={['/survey?studyId=study-1&participantId=participant-1']}>
            <SurveyRoutePage />
          </MemoryRouter>
        </LanguageProvider>,
      );

      expect(screen.getByTestId('daily-survey-form').textContent).toBe('study-1|participant-1|2026-10-02');
    } finally {
      setSystemTime();
    }
  });

  test('shows a loading state while the survey frequency is resolving for a complete link', () => {
    frequencyHookState.isLoading = true;

    renderRoute('?studyId=study-1&participantId=participant-1&date=2026-06-24');

    expect(screen.getByText('Loading the survey…')).toBeTruthy();
    expect(screen.queryByTestId('daily-survey-form')).toBeNull();
    expect(screen.queryByTestId('hourly-survey-form')).toBeNull();
  });

  test('translates the route chrome from ?lang= using the verified upstream tables', () => {
    renderRoute('?studyId=study-1&lang=es');
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

 test('W07 first frequency failure blocks submission, retry resolves HOURLY, refresh failure preserves it', () => {
  frequencyHookState.isError = true;
  const search = '?studyId=study-1&participantId=p1&date=2026-10-02';
  const view = renderRoute(search);
  expect(screen.queryByTestId('daily-survey-form')).toBeNull();
  expect(screen.queryByTestId('hourly-survey-form')).toBeNull();
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retryCalls).toBe(1);
  const route = <LanguageProvider initialSearch={search}><MemoryRouter initialEntries={[`/survey${search}`]}><SurveyRoutePage /></MemoryRouter></LanguageProvider>;
  view.rerender(route);
  expect(screen.getByTestId('hourly-survey-form')).toBeTruthy();
  frequencyHookState.isError = true;
  frequencyHookState.data = undefined;
  view.rerender(<LanguageProvider initialSearch={search}><MemoryRouter initialEntries={[`/survey${search}`]}><SurveyRoutePage /></MemoryRouter></LanguageProvider>);
  expect(screen.getByTestId('hourly-survey-form')).toBeTruthy();
});
