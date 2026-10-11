import { describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { Provider } from 'react-redux';
import { createTranslator } from '@/i18n/translator';
import type { AppUsageEntry } from '@/state/study-operations-api';
import { studyOperationsApi } from '@/state/study-operations-api';
import { installRelativeRequest } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';
import { HOURLY_SURVEY_USER } from './hourly-survey-core';
import { ParticipantHourlySurveyForm } from './participant-hourly-survey-form';
import {
  APP_USAGE_NONE_OPTION,
  APP_USAGE_USER_OPTIONS,
  AppUsageRow,
  groupByApp,
  ParticipantSurveyForm,
} from './participant-survey-form';

const entry: AppUsageEntry = {
  appLabel: 'YouTube',
  appPackageName: 'com.google.android.youtube',
  eventType: 1,
  timestamp: '2026-06-01T10:00:00.000Z',
  timezone: 'America/Chicago',
  users: [],
};

describe('ParticipantSurveyForm - AppUsageRow', () => {
  test('renders the app label and every user option plus the none option', () => {
    render(<AppUsageRow entry={entry} index={0} onToggle={() => {}} selection={[]} />);

    expect(screen.getByText('YouTube')).toBeTruthy();
    for (const option of APP_USAGE_USER_OPTIONS) {
      expect(screen.getByLabelText(option)).toBeTruthy();
    }
    expect(screen.getByLabelText(APP_USAGE_NONE_OPTION)).toBeTruthy();
  });

  test('resolves option labels through the translator while submitting the canonical English value', () => {
    const onToggle = mock(() => {});
    // Spanish has no verified user-option labels yet, so the English fallback renders; the
    // submitted value is the canonical key regardless of the displayed label.
    render(
      <AppUsageRow entry={entry} index={0} onToggle={onToggle} selection={[]} translator={createTranslator('es')} />,
    );

    fireEvent.click(screen.getByLabelText('Child alone'));
    expect(onToggle).toHaveBeenCalledWith(0, 'Child alone', true);
  });

  test('falls back to the package name when there is no label', () => {
    render(<AppUsageRow entry={{ ...entry, appLabel: null }} index={3} onToggle={() => {}} selection={[]} />);
    expect(screen.getByText('com.google.android.youtube')).toBeTruthy();
    // Question number is 1-based.
    expect(screen.getByText('4')).toBeTruthy();
  });

  test('reflects the current selection and reports toggles with the row index', () => {
    const onToggle = mock(() => {});
    render(<AppUsageRow entry={entry} index={2} onToggle={onToggle} selection={['Child alone']} />);

    const childAlone = screen.getByLabelText<HTMLInputElement>('Child alone');
    const parentAlone = screen.getByLabelText<HTMLInputElement>('Parent alone');
    expect(childAlone.checked).toBe(true);
    expect(parentAlone.checked).toBe(false);

    fireEvent.click(parentAlone);
    expect(onToggle).toHaveBeenCalledWith(2, 'Parent alone', true);
  });
});

describe('ParticipantSurveyForm - groupByApp', () => {
  test('asks once per app, keeping every session of it, in first-use order', () => {
    const chrome = { ...entry, appLabel: 'Chrome', appPackageName: 'com.android.chrome' };
    const later = { ...entry, timestamp: '2026-06-01T18:00:00.000Z' };

    const groups = groupByApp([entry, chrome, later]);

    expect(groups.map((group) => group[0].appPackageName)).toEqual([
      'com.google.android.youtube',
      'com.android.chrome',
    ]);
    expect(groups[0]).toEqual([entry, later]);
  });
});

test.each([
  false,
  true,
])('app-usage form (hourly=%s) loads, submits a stable payload, and renders success', async (hourly) => {
  const savedFetch = globalThis.fetch;
  const restoreRequest = installRelativeRequest();
  const store = createApiStore();
  const writes: { body: AppUsageEntry[]; key: string | null; path: string }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const request = input as Request;
    if (request.method === 'POST') {
      writes.push({
        body: (await request.json()) as AppUsageEntry[],
        key: request.headers.get('Idempotency-Key'),
        path: new URL(request.url).pathname,
      });
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify([entry]), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const Form = hourly ? ParticipantHourlySurveyForm : ParticipantSurveyForm;
  try {
    render(
      <Provider store={store}>
        <Form date="2026-06-01" participantId="participant/1" studyId="study/1" />
      </Provider>,
    );
    if (hourly) {
      fireEvent.click(await screen.findByRole('button', { name: 'Begin Survey' }));
      fireEvent.click(screen.getByLabelText('YouTube'));
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    } else {
      fireEvent.click(await screen.findByLabelText('Child alone'));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Submit survey' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Thank you' })).toBeTruthy());
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe('/chronicle/v3/survey/study%2F1/participant/participant%2F1/app-usage');
    expect(writes[0]?.key).toBeTruthy();
    expect(writes[0]?.body).toEqual([{ ...entry, users: [hourly ? HOURLY_SURVEY_USER : 'Child alone'] }]);
  } finally {
    cleanup();
    store.dispatch(studyOperationsApi.util.resetApiState());
    globalThis.fetch = savedFetch;
    restoreRequest();
  }
});
