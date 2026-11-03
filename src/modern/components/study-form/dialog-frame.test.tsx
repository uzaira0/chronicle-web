import { expect, mock, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import { StudyFormContents } from './dialog-frame';

test('announces asynchronous settings reads and failures', () => {
  const retry = mock(() => undefined);
  const view = render(
    <StudyFormContents onRetry={() => undefined} onSubmit={() => undefined} readState="pending">
      form
    </StudyFormContents>,
  );
  expect(screen.getByRole('status').textContent).toContain('Loading');
  view.rerender(
    <StudyFormContents onRetry={retry} onSubmit={() => undefined} readState="failed">
      form
    </StudyFormContents>,
  );
  expect(screen.getByRole('alert').textContent).toContain('settings');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledTimes(1);
  view.rerender(
    <StudyFormContents onRetry={() => undefined} onSubmit={() => undefined} readState="ready">
      form
    </StudyFormContents>,
  );
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('form')).toBeTruthy();
});
