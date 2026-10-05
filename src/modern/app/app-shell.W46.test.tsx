import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';

import { AppShell } from '@/app/app-shell';
import { store } from '@/state/store';
import { useUiShellStore } from '@/stores/ui-shell-store';

afterEach(() => {
  cleanup();
  useUiShellStore.getState().setSidebarCollapsed(false);
});

describe('collapsed desktop navigation (W46)', () => {
  test('keeps link names when collapsed and uses visible text when expanded', () => {
    useUiShellStore.getState().setSidebarCollapsed(true);
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppShell />
        </MemoryRouter>
      </Provider>,
    );

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const operations = within(nav).getByRole('link', { name: 'Operations' });
    expect(operations.getAttribute('aria-label')).toBe('Operations');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    const expandedOperations = within(nav).getByRole('link', { name: 'Operations' });
    expect(expandedOperations.getAttribute('aria-label')).toBeNull();
  });
});
