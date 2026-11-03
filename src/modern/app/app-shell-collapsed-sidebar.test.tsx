import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';

import { AppShell } from '@/app/app-shell';
import { store } from '@/state/store';
import { withBlockedStorage } from '@/test/browser-env';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderShell() {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShell />
      </MemoryRouter>
    </Provider>,
  );
}

describe('collapsed desktop navigation', () => {
  test('keeps link names when collapsed and uses visible text when expanded', () => {
    localStorage.setItem('chronicle.sidebar-collapsed', 'true');
    renderShell();

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const operations = within(nav).getByRole('link', { name: 'Operations' });
    expect(operations.getAttribute('aria-label')).toBe('Operations');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    const expandedOperations = within(nav).getByRole('link', { name: 'Operations' });
    expect(expandedOperations.getAttribute('aria-label')).toBeNull();
  });

  test('remembers the collapsed sidebar across page loads', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    cleanup();
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Operations' }).getAttribute('aria-label')).toBe('Operations');
  });
});

// With site data blocked, reading the remembered choice throws: the dashboard opens with the full sidebar and the
// toggle still works for this page.
test('a browser that blocks storage opens with the sidebar expanded and still collapses it', () => {
  withBlockedStorage(() => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Operations' }).getAttribute('aria-label')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    expect(within(nav).getByRole('link', { name: 'Operations' }).getAttribute('aria-label')).toBe('Operations');
  });
});
