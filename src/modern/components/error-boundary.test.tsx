import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { RouteOutlet } from './error-boundary';

function luminance(hex: string): number {
  const channels = hex.match(/[\da-f]{2}/gi)?.map((part) => Number.parseInt(part, 16) / 255) ?? [];
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

function token(css: string, selector: RegExp, name: string): string {
  const block = css.match(selector)?.[1] ?? '';
  const value = block.match(new RegExp(`${name}:\\s*(#[\\da-f]+)`, 'i'))?.[1];
  if (!value) throw new Error(`Missing ${name} theme token`);
  return value;
}

const originalFetch = globalThis.fetch;

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

function renderLayoutWithFailingPage(message: string) {
  return render(
    <MemoryRouter initialEntries={['/broken']}>
      <Routes>
        <Route
          element={
            <div>
              <nav>shell navigation</nav>
              <RouteOutlet />
            </div>
          }
        >
          <Route element={<Boom message={message} />} path="broken" />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// production-readiness U1: one page's render error must not take down the shell and its
// navigation, and retrying a failed route chunk must fetch it again.
describe('RouteOutlet', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test('keeps the shell when the routed page throws', () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 204 }))) as unknown as typeof fetch;
    spyOn(console, 'error').mockImplementation(() => undefined);
    renderLayoutWithFailingPage('render bug');
    expect(screen.getByText('shell navigation')).toBeTruthy();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  test('reloads the page when the retry follows a failed chunk load', () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 204 }))) as unknown as typeof fetch;
    spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = spyOn(window.location, 'reload').mockImplementation(() => undefined);
    renderLayoutWithFailingPage('Failed to fetch dynamically imported module: /chunk-abc.js');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test.each([
    '../app/app-shell.tsx',
    '../app/participant-shell.tsx',
    '../routes/study-layout.tsx',
  ])('%s renders routed pages behind a route error boundary', (path) => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf-8');
    expect(source).toContain('<RouteOutlet />');
    expect(source).not.toContain('<Outlet />');
  });

  test('crash fallback text and retry button keep normal-text contrast in light and dark themes', () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 204 }))) as unknown as typeof fetch;
    spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = renderLayoutWithFailingPage('render bug');
    const description = container.querySelector('p');
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(description?.style.color).toBe('var(--muted-foreground)');
    expect(retry.style.background).toBe('var(--foreground)');
    expect(retry.style.color).toBe('var(--background)');

    const css = readFileSync(new URL('../../../node_modules/@eqds/tokens/src/tokens.css', import.meta.url), 'utf-8');
    const themes = [
      { background: token(css, /:root,[\s\S]*?\{([\s\S]*?)\}/, '--eq-bg'), foreground: token(css, /:root,[\s\S]*?\{([\s\S]*?)\}/, '--eq-ink'), muted: token(css, /:root,[\s\S]*?\{([\s\S]*?)\}/, '--eq-muted') },
      { background: token(css, /\[data-eq-theme="dark"\],[\s\S]*?\{([\s\S]*?)\}/, '--eq-bg'), foreground: token(css, /\[data-eq-theme="dark"\],[\s\S]*?\{([\s\S]*?)\}/, '--eq-ink'), muted: token(css, /\[data-eq-theme="dark"\],[\s\S]*?\{([\s\S]*?)\}/, '--eq-muted') },
    ];
    for (const theme of themes) {
      expect(contrast(theme.muted, theme.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.foreground, theme.background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
