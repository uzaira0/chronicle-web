import { describe, expect, mock, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';

import { createTranslator } from '@/i18n/translator';
import { IntroStep, SummaryStep } from './tud-form';
import type { OptionContext } from './tud-options';

const ctx: OptionContext = {
  effectiveCode: 'en',
  enTranslator: createTranslator('en'),
  translator: createTranslator('en'),
};

describe('IntroStep (store-free render smoke test)', () => {
  test('renders the intro copy and the clock-format selector when unlocked', () => {
    render(<IntroStep activityDay="today" clockFormat={12} ctx={ctx} locked={false} onClockFormat={() => {}} />);
    expect(screen.getByText(/Thank you for taking the time/)).toBeTruthy();
    expect(screen.getByLabelText('12-hour clock format')).toBeTruthy();
    expect(screen.getByLabelText('24-hour clock format')).toBeTruthy();
  });

  test('hides the clock-format selector when locked', () => {
    render(<IntroStep activityDay="yesterday" clockFormat={24} ctx={ctx} locked onClockFormat={() => {}} />);
    expect(screen.queryByLabelText('12-hour clock format')).toBeNull();
  });
});

describe('SummaryStep (store-free render smoke test)', () => {
  const answers = {
    3: {
      activityEndTime: '19:00',
      activityStartTime: '07:00',
      followUpCompleted: true,
      primaryActivity: 'Playing indoors',
    },
  };

  test('renders one row per completed activity with an Edit control', () => {
    const onEdit = mock(() => {});
    render(<SummaryStep answers={answers} ctx={ctx} is12h onEdit={onEdit} />);
    expect(screen.getByText(/Playing indoors/)).toBeTruthy();
    expect(screen.getByText(/7:00 AM/)).toBeTruthy(); // 12h formatting of the start
    fireEvent.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledWith(3);
  });
});
