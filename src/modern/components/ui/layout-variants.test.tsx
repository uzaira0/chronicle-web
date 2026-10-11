import { afterEach, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/i18n';
import { Card } from './card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';

afterEach(() => cleanup());
test('navigation and destructive variants preserve the audited drawer layout and error border', () => {
  render(
    <LanguageProvider initialSearch="">
      <Card data-testid="error-card" variant="destructive" />
      <Dialog open>
        <DialogContent variant="navigation">
          <DialogTitle>Navigation</DialogTitle>
          <DialogDescription>Links</DialogDescription>
        </DialogContent>
      </Dialog>
    </LanguageProvider>,
  );
  const classes = screen.getByRole('dialog').className;
  for (const token of [
    'left-0',
    'top-0',
    'h-dvh',
    'w-72',
    'max-w-navigation-drawer',
    'translate-x-0',
    'rounded-none',
    'p-4',
  ])
    expect(classes.split(' ')).toContain(token);
  expect(classes.split(' ')).not.toContain('left-1/2');
  expect(screen.getByTestId('error-card').className).toContain('border-destructive/40');
});
