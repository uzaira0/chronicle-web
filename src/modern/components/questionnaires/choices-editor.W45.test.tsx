import { describe, expect, mock, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';

import { LanguageProvider } from '@/i18n';

import { ChoicesEditor } from './ChoicesEditor';

describe('ChoicesEditor keyboard reordering', () => {
  test('moves a choice with named controls, persists the new order, and keeps focus on it', () => {
    const onChange = mock(() => undefined);
    render(
      <LanguageProvider initialSearch="">
        <ChoicesEditor choices={['First', 'Second', 'Third']} onChange={onChange} />
      </LanguageProvider>,
    );

    const moveUp = screen.getByRole('button', { name: 'Move choice 3 up' });
    moveUp.focus();
    fireEvent.click(moveUp);
    expect(onChange).toHaveBeenLastCalledWith(['First', 'Third', 'Second']);
    expect(screen.getByLabelText<HTMLInputElement>('Choice 2').value).toBe('Third');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move choice 2 up' }));
  });
});
