import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { RouteOutlet } from './error-boundary';

const originalFetch = globalThis.fetch;

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

function renderLayoutWithFailingPage(message: string) {
  render(
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
});
