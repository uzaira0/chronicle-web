import { describe, expect, mock, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';

import { createTranslator } from '@/i18n/translator';
import type { AppUsageEntry } from '@/state/study-operations-api';
import { APP_USAGE_NONE_OPTION, APP_USAGE_USER_OPTIONS, AppUsageRow } from './participant-survey-form';

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
