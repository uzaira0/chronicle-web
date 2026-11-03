import { beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

type FrequencyHookState = {
  currentData: { appUsageFrequency: 'DAILY' | 'HOURLY' } | undefined;
  isLoading: boolean;
  isError: boolean;
};

let retryCalls = 0;
const retryFrequency = () => {
  retryCalls++;
  frequencyHookState.currentData = { appUsageFrequency: 'HOURLY' };
  frequencyHookState.isError = false;
};

const frequencyHookState: FrequencyHookState = {
  currentData: undefined,
  isLoading: false,
  isError: false,
};

type SurveyDay = { date: string; state: 'UNANSWERED' | 'ANSWERED' | 'NEW_APPS' };
const daysHookState: { currentData: { timeZone: string; today: string; days: SurveyDay[] } | undefined } = {
  currentData: undefined,
};
const DAYS: SurveyDay[] = [
  { date: '2026-10-01', state: 'ANSWERED' },
  { date: '2026-10-02', state: 'NEW_APPS' },
  { date: '2026-10-03', state: 'UNANSWERED' },
];

const ParticipantHourlySurveyForm = ({
  date,
  participantId,
  studyId,
}: {
  date: string;
  participantId: string;
  studyId: string;
}) => <div data-testid="hourly-survey-form">{`${studyId}|${participantId}|${date}`}</div>;
await mock.module('@/components/participant-hourly-survey-form', () => ({
  ParticipantHourlySurveyForm,
}));

const ParticipantLandingCard = ({
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
);
await mock.module('@/components/participant-landing-card', () => ({
  ParticipantLandingCard,
}));

const ParticipantSurveyForm = ({
  date,
  participantId,
  studyId,
}: {
  date: string;
  participantId: string;
  studyId: string;
}) => (
  <div data-testid="daily-survey-form">
    {`${studyId}|${participantId}|${date}`}
    {/* Uncontrolled: a remount drops the participant's unsent selection, as the real form's state would. */}
    <input aria-label="Unsent answer" type="checkbox" />
  </div>
);
await mock.module('@/components/participant-survey-form', () => ({
  ParticipantSurveyForm,
}));

// Spread the real module: mock.module is process-wide, so a partial stub leaks into later files.
const realStudyOperationsApi = await import('@/state/study-operations-api');

await mock.module('@/state/study-operations-api', () => ({
  ...realStudyOperationsApi,
  useGetAppUsageFrequencyQuery: () => ({
    ...frequencyHookState,
    isSuccess: !frequencyHookState.isLoading && !frequencyHookState.isError,
    refetch: retryFrequency,
  }),
  useGetAppUsageSurveyDaysQuery: () => ({ ...daysHookState, isError: false, refetch: () => undefined }),
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
    frequencyHookState.currentData = { appUsageFrequency: 'DAILY' };
    frequencyHookState.isLoading = false;
    frequencyHookState.isError = false;
    daysHookState.currentData = { timeZone: 'America/Santiago', today: '2026-10-04', days: DAYS };
    retryCalls = 0;
  });

  test('renders the participant landing card when the link is incomplete', () => {
    renderRoute('?studyId=study-1');

    expect(screen.getByTestId('participant-landing-card')).toBeTruthy();
    expect(screen.getByText('App usage survey')).toBeTruthy();
  });

  // A dateless link opens the server's oldest open day, whatever the participant's own clock says.
  test('opens the oldest day with apps to answer for a link without a date', () => {
    setSystemTime(new Date(2026, 11, 25, 12, 0));
    try {
      renderRoute('?studyId=study-1&participantId=participant-1');
      expect(screen.getByTestId('daily-survey-form').textContent).toBe('study-1|participant-1|2026-10-02');
    } finally {
      setSystemTime();
    }
  });

  test('opens the linked day when the server lists it, and the default day when it does not', () => {
    const view = renderRoute('?studyId=study-1&participantId=participant-1&date=2026-10-01');
    expect(screen.getByTestId('daily-survey-form').textContent).toBe('study-1|participant-1|2026-10-01');
    view.unmount();

    renderRoute('?studyId=study-1&participantId=participant-1&date=2026-10-04');
    expect(screen.getByTestId('daily-survey-form').textContent).toBe('study-1|participant-1|2026-10-02');
  });

  test('opens the latest day once every day is answered', () => {
    daysHookState.currentData = {
      timeZone: 'America/Santiago',
      today: '2026-10-04',
      days: DAYS.map((day) => ({ ...day, state: 'ANSWERED' })),
    };
    renderRoute('?studyId=study-1&participantId=participant-1');
    expect(screen.getByTestId('daily-survey-form').textContent).toBe('study-1|participant-1|2026-10-03');
  });

  test('the calendar marks each day and opens any listed day', () => {
    renderRoute('?studyId=study-1&participantId=participant-1');

    expect(screen.getByRole('button', { name: 'Oct 1, 2026: Answered' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Oct 2, 2026: New apps to answer' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Oct 3, 2026: Not answered' })).toBeTruthy();
    // Today and later days have not ended: they cannot be opened.
    expect(screen.getByRole('button', { name: 'Oct 4, 2026' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Oct 31, 2026' }).hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Oct 1, 2026: Answered' }));
    expect(screen.getByTestId('daily-survey-form').textContent).toBe('study-1|participant-1|2026-10-01');
  });

  test('says so when no day has ended since enrollment', () => {
    daysHookState.currentData = { timeZone: 'America/Santiago', today: '2026-10-04', days: [] };
    renderRoute('?studyId=study-1&participantId=participant-1');

    expect(screen.getByText('No day to answer yet')).toBeTruthy();
    expect(screen.queryByTestId('daily-survey-form')).toBeNull();
  });

  test('shows a loading state while the survey frequency is resolving for a complete link', () => {
    frequencyHookState.currentData = undefined;
    frequencyHookState.isLoading = true;

    renderRoute('?studyId=study-1&participantId=participant-1&date=2026-06-24');

    const skeleton = screen.getByRole('status', { name: 'Loading the survey…' });
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    expect(skeleton.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByTestId('daily-survey-form')).toBeNull();
    expect(screen.queryByTestId('hourly-survey-form')).toBeNull();
  });

  test('translates the route chrome from ?lang= using the verified upstream tables', () => {
    renderRoute('?studyId=study-1&lang=es');
    expect(screen.getByText('Encuesta de uso de las aplicaciones')).toBeTruthy();
  });

  test('renders the hourly survey form when the study is configured for hourly app usage', () => {
    frequencyHookState.currentData = { appUsageFrequency: 'HOURLY' };

    renderRoute('?studyId=study-1&participantId=participant-1&date=2026-10-03');

    expect(screen.getByTestId('hourly-survey-form').textContent).toBe('study-1|participant-1|2026-10-03');
    expect(screen.queryByTestId('daily-survey-form')).toBeNull();
  });

  test('renders the daily survey form when the study is explicitly configured for daily app usage', () => {
    frequencyHookState.currentData = { appUsageFrequency: 'DAILY' };

    renderRoute('?studyId=study-1&participantId=participant-1&date=2026-10-03');

    expect(screen.getByTestId('daily-survey-form').textContent).toBe('study-1|participant-1|2026-10-03');
    expect(screen.queryByTestId('hourly-survey-form')).toBeNull();
  });

  test('waits for the survey days before opening a day', () => {
    daysHookState.currentData = undefined;
    renderRoute('?studyId=study-1&participantId=participant-1');

    expect(screen.getByRole('status', { name: 'Loading the survey…' })).toBeTruthy();
    expect(screen.queryByTestId('daily-survey-form')).toBeNull();
  });

  test('waits for the instrument when the query has no verified data', () => {
    frequencyHookState.currentData = undefined;
    renderRoute('?studyId=study-1&participantId=participant-1&date=2026-06-24');

    const skeleton = screen.getByRole('status', { name: 'Loading the survey…' });
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    expect(skeleton.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByTestId('daily-survey-form')).toBeNull();
    expect(screen.queryByTestId('hourly-survey-form')).toBeNull();
  });
});

test('first frequency failure blocks submission, retry resolves HOURLY, refresh failure preserves it', () => {
  frequencyHookState.currentData = undefined;
  frequencyHookState.isError = true;
  daysHookState.currentData = { timeZone: 'America/Santiago', today: '2026-10-04', days: DAYS };
  const search = '?studyId=study-1&participantId=p1&date=2026-10-02';
  const view = renderRoute(search);
  expect(screen.queryByTestId('daily-survey-form')).toBeNull();
  expect(screen.queryByTestId('hourly-survey-form')).toBeNull();
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retryCalls).toBe(1);
  const route = (
    <LanguageProvider initialSearch={search}>
      <MemoryRouter initialEntries={[`/survey${search}`]}>
        <SurveyRoutePage />
      </MemoryRouter>
    </LanguageProvider>
  );
  view.rerender(route);
  expect(screen.getByTestId('hourly-survey-form')).toBeTruthy();
  frequencyHookState.isError = true;
  // A failed refetch keeps the successful result for these arguments.
  view.rerender(
    <LanguageProvider initialSearch={search}>
      <MemoryRouter initialEntries={[`/survey${search}`]}>
        <SurveyRoutePage />
      </MemoryRouter>
    </LanguageProvider>,
  );
  expect(screen.getByTestId('hourly-survey-form')).toBeTruthy();
});

test('a reconnect that changes the frequency keeps the unsent DAILY answer until the participant moves on', () => {
  frequencyHookState.currentData = { appUsageFrequency: 'DAILY' };
  daysHookState.currentData = { timeZone: 'America/Santiago', today: '2026-10-04', days: DAYS };
  const search = '?studyId=study-1&participantId=p1&date=2026-10-02';
  const route = () => (
    <LanguageProvider initialSearch={search}>
      <MemoryRouter initialEntries={[`/survey${search}`]}>
        <SurveyRoutePage />
      </MemoryRouter>
    </LanguageProvider>
  );
  const view = render(route());
  fireEvent.click(screen.getByRole('checkbox', { name: 'Unsent answer' }));
  // Another tab saved HOURLY; the refetch on reconnect returns it.
  frequencyHookState.currentData = { appUsageFrequency: 'HOURLY' };
  view.rerender(route());
  expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Unsent answer' }).checked).toBe(true);
  expect(screen.queryByTestId('hourly-survey-form')).toBeNull();
  // The next opening the participant chooses uses the study's current instrument.
  fireEvent.click(screen.getByRole('button', { name: 'Oct 3, 2026: Not answered' }));
  expect(screen.getByTestId('hourly-survey-form').textContent).toBe('study-1|p1|2026-10-03');
});
