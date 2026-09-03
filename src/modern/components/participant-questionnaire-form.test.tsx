import { describe, expect, mock, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';

import { QuestionField } from './participant-questionnaire-form';

describe('ParticipantQuestionnaireForm - QuestionField', () => {
  test('renders an open-ended question as a textarea bound to the current answer', () => {
    const onOpenEndedChange = mock(() => {});
    render(
      <QuestionField
        answer={['hello']}
        index={0}
        onOpenEndedChange={onOpenEndedChange}
        onToggleChoice={() => {}}
        question={{ choices: [], title: 'How do you feel?' }}
      />,
    );

    const textarea = screen.getByLabelText<HTMLTextAreaElement>(/answer to question 1/i);
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe('hello');

    fireEvent.change(textarea, { target: { value: 'updated' } });
    expect(onOpenEndedChange).toHaveBeenCalledWith(0, 'updated');
  });

  test('renders a multiple-choice question as a checkbox group and reports toggles', () => {
    const onToggleChoice = mock(() => {});
    render(
      <QuestionField
        answer={['Daily']}
        index={2}
        onOpenEndedChange={() => {}}
        onToggleChoice={onToggleChoice}
        question={{ choices: ['Daily', 'Weekly', 'Never'], title: 'How often?' }}
      />,
    );

    // The pre-selected choice is checked, others are not.
    const daily = screen.getByLabelText<HTMLInputElement>('Daily');
    const weekly = screen.getByLabelText<HTMLInputElement>('Weekly');
    expect(daily.type).toBe('checkbox');
    expect(daily.checked).toBe(true);
    expect(weekly.checked).toBe(false);

    // Question number is 1-based.
    expect(screen.getByText('3')).toBeTruthy();

    fireEvent.click(weekly);
    expect(onToggleChoice).toHaveBeenCalledWith(2, 'Weekly', true);
  });
});
