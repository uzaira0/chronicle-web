import { expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { ChoicesEditor } from './ChoicesEditor';

test('each editor associates its own labels even when choice keys repeat', () => {
  render(
    <>
      <ChoicesEditor choices={['A', 'B']} onChange={() => {}} />
      <ChoicesEditor choices={['C', 'D']} onChange={() => {}} />
    </>,
  );
  const inputs = screen.getAllByLabelText<HTMLInputElement>('Choice 1');
  expect(inputs.map(({ value }) => value)).toEqual(['A', 'C']);
  const ids = Array.from(document.querySelectorAll('[id]'), ({ id }) => id);
  expect(new Set(ids).size).toBe(ids.length);
});
