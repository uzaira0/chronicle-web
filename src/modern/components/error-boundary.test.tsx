import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';

import { AppShell } from '@/app/app-shell';
import { ParticipantShell } from '@/app/participant-shell';
import { StudyLayout } from '@/routes/study-layout';
import { store } from '@/state/store';

import { contrast } from '@/test/contrast';

import { RouteOutlet } from './error-boundary';

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

// One page's render error must not take down the shell and its
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
    ['AppShell', <AppShell key="app" />, '/'],
    ['ParticipantShell', <ParticipantShell key="participant" />, '/'],
    ['StudyLayout', <StudyLayout key="study" />, '/studies/:studyId'],
  ] as const)('%s renders routed pages behind a route error boundary', async (_name, shell, parentPath) => {
    const respond = (path: string) => {
      if (path.endsWith('/lifecycle')) return Response.json('ACTIVE');
      if (path.startsWith('/chronicle/api/web/limits/')) return Response.json({ studyDataExpires: null });
      if (path === '/chronicle/api/web/study/s1') return Response.json({ id: 's1', modules: {}, title: 'Study' });
      return new Response(null, { status: 204 });
    };
    globalThis.fetch = mock((input: RequestInfo | URL) =>
      Promise.resolve(
        respond(new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname),
      ),
    ) as unknown as typeof fetch;
    spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[parentPath === '/' ? '/broken' : '/studies/s1/broken']}>
          <Routes>
            <Route element={shell} path={parentPath}>
              <Route element={<Boom message="render bug" />} path="broken" />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    expect(await screen.findByText('Something went wrong')).toBeTruthy();
  });

  test('crash fallback text and retry button keep normal-text contrast in light and dark themes', () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 204 }))) as unknown as typeof fetch;
    spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = renderLayoutWithFailingPage('render bug');
    const description = container.querySelector('p');
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(description?.classList.contains('text-muted-foreground')).toBe(true);
    expect(retry.classList.contains('bg-foreground')).toBe(true);
    expect(retry.classList.contains('text-background')).toBe(true);

    const css = readFileSync(new URL('../../../node_modules/@eqds/tokens/src/tokens.css', import.meta.url), 'utf-8');
    const themes = [
      {
        background: token(css, /:root,[\s\S]*?\{([\s\S]*?)\}/, '--eq-bg'),
        foreground: token(css, /:root,[\s\S]*?\{([\s\S]*?)\}/, '--eq-ink'),
        muted: token(css, /:root,[\s\S]*?\{([\s\S]*?)\}/, '--eq-muted'),
      },
      {
        background: token(css, /\[data-eq-theme="dark"\],[\s\S]*?\{([\s\S]*?)\}/, '--eq-bg'),
        foreground: token(css, /\[data-eq-theme="dark"\],[\s\S]*?\{([\s\S]*?)\}/, '--eq-ink'),
        muted: token(css, /\[data-eq-theme="dark"\],[\s\S]*?\{([\s\S]*?)\}/, '--eq-muted'),
      },
    ];
    for (const theme of themes) {
      expect(contrast(theme.muted, theme.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.foreground, theme.background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
