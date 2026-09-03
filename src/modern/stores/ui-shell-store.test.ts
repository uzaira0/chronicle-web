import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { installBrowserEnv, uninstallBrowserEnv } from '../test/browser-env';
import { readPersistedState } from '../test/local-storage-mock';

let importCounter = 0;
function nextId() {
  importCounter += 1;
  return importCounter;
}

describe('useUiShellStore', () => {
  beforeEach(() => {
    installBrowserEnv();
  });

  afterEach(() => {
    uninstallBrowserEnv();
  });

  it('toggles the sidebar and persists only durable shell preferences', async () => {
    const { useUiShellStore } = (await import(
      `./ui-shell-store.ts?v=${nextId()}`
    )) as typeof import('./ui-shell-store');

    useUiShellStore.getState().toggleSidebar();
    useUiShellStore.getState().setMobileNavOpen(true);
    useUiShellStore.getState().setStatusDialogOpen(false);

    expect(useUiShellStore.getState().isSidebarCollapsed).toBe(true);
    expect(useUiShellStore.getState().isMobileNavOpen).toBe(true);
    expect(useUiShellStore.getState().isStatusDialogOpen).toBe(false);

    const persistedState = readPersistedState('chronicle-ui-shell');
    expect(persistedState).toEqual({
      isSidebarCollapsed: true,
      isStatusDialogOpen: false,
    });
    expect(persistedState.isMobileNavOpen).toBeUndefined();
  });
});
