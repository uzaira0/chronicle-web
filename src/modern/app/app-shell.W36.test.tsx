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

describe('mobile application navigation (W36)', () => {
  test('contains focus, closes on Escape, and returns focus to its trigger', async () => {
    useUiShellStore.getState().setMobileNavOpen(false);
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppShell />
        </MemoryRouter>
      </Provider>,
    );

    const opener = screen.getByRole('button', { name: 'Open navigation' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole('dialog', { name: 'Navigation' });
    expect(opener.closest('[aria-hidden="true"]')).toBeTruthy();
    const close = within(dialog).getByRole('button', { name: 'Close' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).not.toBe(opener);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
});
