import { describe, expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { useTheme } from 'next-themes';

import { ThemeProvider } from './theme-provider';

function ThemeProbe() {
  const { theme } = useTheme();
  return <span data-testid="theme">{theme}</span>;
}

// design-review DR21 (Equal invariant): a first visit renders light whatever the OS prefers;
// dark stays one toggle away.
describe('ThemeProvider', () => {
  test('defaults to the light theme on a first visit', () => {
    try {
      localStorage.removeItem('chronicle-theme');
    } catch {
      // storage unavailable: the provider falls back to its default, which is what we assert
    }
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('light');
  });
});
