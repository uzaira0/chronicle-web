import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';

import { AppShell } from '@/app/app-shell';
import { store } from '@/state/store';
import { useUiShellStore } from '@/stores/ui-shell-store';

afterEach(() => {
  cleanup();
  useUiShellStore.getState().setMobileNavOpen(false);
});

describe('mobile shell controls (W72)', () => {
  test('keeps header actions visible and moves language selection into reachable mobile navigation', async () => {
    useUiShellStore.getState().setMobileNavOpen(false);
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppShell />
        </MemoryRouter>
      </Provider>,
    );

    const header = screen.getByRole('banner');
    expect(within(header).queryByRole('combobox', { name: 'Language' }) !== null).toBe(false);
    expect(within(header).getByRole('button', { name: 'Sign out' })).toBeTruthy();
    await waitFor(() => expect(within(header).getByRole('button', { name: 'Toggle theme' })).toBeTruthy());

    fireEvent.click(within(header).getByRole('button', { name: 'Open navigation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Navigation' });
    expect(within(dialog).getByRole('combobox', { name: 'Language' })).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Operations' })).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Studies' })).toBeTruthy();
  });
});
