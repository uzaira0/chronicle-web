import { describe, expect, test } from 'bun:test';
import { act, render, screen } from '@testing-library/react';
import { useTheme } from 'next-themes';

import { ThemeProvider } from './theme-provider';

function ThemeProbe() {
  const { theme } = useTheme();
  return <span data-testid="theme">{theme}</span>;
}

// Equal invariant: a first visit renders light whatever the OS prefers;
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

  // Phones tint the browser bar from the page's theme-color meta: it follows the theme's own background colour.
  test('paints the browser theme colour from the active theme background', async () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#ffffff';
    document.head.append(meta);
    document.documentElement.style.setProperty('--eq-bg', ' #0b1f33 ');
    try {
      render(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>,
      );
      await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(meta.content).toBe('#0b1f33');
    } finally {
      meta.remove();
      document.documentElement.style.removeProperty('--eq-bg');
    }
  });
});
