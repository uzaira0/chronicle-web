import { describe, expect, mock, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';

import type { FieldDef } from './tud-schema';
import { CheckboxControl, ClockFormatSelect, FieldControl, RadioControl, TimeControl } from './tud-widgets';

const radioField: FieldDef = {
  code: 'q',
  options: [
    { label: 'Yes label', value: 'Yes' },
    { label: 'No label', value: 'No' },
  ],
  required: true,
  title: 'Question?',
  widget: 'radio',
};

const checkboxField: FieldDef = {
  code: 'multi',
  minItems: 1,
  options: [
    { label: 'Alpha label', value: 'Alpha' },
    { label: 'Beta label', value: 'Beta' },
  ],
  required: true,
  title: 'Pick some',
  widget: 'checkbox',
};

describe('RadioControl', () => {
  test('reports the english option value on selection', () => {
    const onChange = mock(() => {});
    render(<RadioControl field={radioField} onChange={onChange} value="" />);
    const yes = screen.getByLabelText<HTMLInputElement>('Yes label');
    expect(yes.checked).toBe(false);
    fireEvent.click(yes);
    expect(onChange).toHaveBeenCalledWith('q', 'Yes');
  });

  test('reflects the current selection', () => {
    render(<RadioControl field={radioField} onChange={() => {}} value="No" />);
    expect(screen.getByLabelText<HTMLInputElement>('No label').checked).toBe(true);
  });
});

describe('CheckboxControl', () => {
  test('toggles add/remove the english value, preserving prior selections', () => {
    const onChange = mock(() => {});
    render(<CheckboxControl field={checkboxField} onChange={onChange} value={['Alpha']} />);
    expect(screen.getByLabelText<HTMLInputElement>('Alpha label').checked).toBe(true);
    fireEvent.click(screen.getByLabelText('Beta label'));
    expect(onChange).toHaveBeenCalledWith('multi', ['Alpha', 'Beta']);
  });

  test('the Other branch folds free text into the stored array', () => {
    const onChange = mock(() => {});
    const withOther: FieldDef = { ...checkboxField, withOther: true };
    const { rerender } = render(<CheckboxControl field={withOther} onChange={onChange} value={[]} />);
    // checking Other stores the sentinel
    fireEvent.click(screen.getByLabelText('Other'));
    expect(onChange).toHaveBeenCalledWith('multi', ['Other']);
    // once a free-text value is present, the text box shows it and edits replace it
    rerender(<CheckboxControl field={withOther} onChange={onChange} value={['custom answer']} />);
    const text = screen.getByLabelText<HTMLInputElement>('Other, please specify');
    expect(text.value).toBe('custom answer');
    fireEvent.change(text, { target: { value: 'edited' } });
    expect(onChange).toHaveBeenCalledWith('multi', ['edited']);
  });
});

describe('ClockFormatSelect', () => {
  test('renders both formats and reports the chosen one', () => {
    const onChange = mock(() => {});
    render(
      <ClockFormatSelect labels={['12-hour clock format', '24-hour clock format']} onChange={onChange} value={12} />,
    );
    expect(screen.getByLabelText<HTMLInputElement>('12-hour clock format').checked).toBe(true);
    fireEvent.click(screen.getByLabelText('24-hour clock format'));
    expect(onChange).toHaveBeenCalledWith(24);
  });
});

describe('TimeControl', () => {
  test('falls back to the field default and reports edits', () => {
    const onChange = mock(() => {});
    const field: FieldDef = {
      code: 'dayStartTime',
      defaultTime: '07:00',
      required: true,
      title: 'Wake?',
      widget: 'time',
    };
    render(<TimeControl field={field} onChange={onChange} value={undefined} />);
    const input = screen.getByDisplayValue('07:00');
    fireEvent.change(input, { target: { value: '08:30' } });
    expect(onChange).toHaveBeenCalledWith('dayStartTime', '08:30');
  });

  test('commits its default into state on mount (accept-default path must not block Next)', () => {
    const onChange = mock(() => {});
    const field: FieldDef = {
      code: 'dayStartTime',
      defaultTime: '07:00',
      required: true,
      title: 'Wake?',
      widget: 'time',
    };
    // Mount with no answer yet: the shown 07:00 must be reported so validation sees a value.
    render(<TimeControl field={field} onChange={onChange} value={undefined} />);
    expect(onChange).toHaveBeenCalledWith('dayStartTime', '07:00');
  });

  test('does not overwrite an existing answer', () => {
    const onChange = mock(() => {});
    const field: FieldDef = {
      code: 'dayStartTime',
      defaultTime: '07:00',
      required: true,
      title: 'Wake?',
      widget: 'time',
    };
    render(<TimeControl field={field} onChange={onChange} value="09:15" />);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('FieldControl', () => {
  test('renders the title, description, and the required-error message when invalid', () => {
    const field: FieldDef = { ...radioField, description: 'Choose one' };
    render(<FieldControl field={field} invalid onChange={() => {}} value="" />);
    expect(screen.getByText('Question?')).toBeTruthy();
    expect(screen.getByText('Choose one')).toBeTruthy();
    expect(screen.getByText('Response is required')).toBeTruthy();
  });
});
