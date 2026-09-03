import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { installBrowserEnv, uninstallBrowserEnv } from '../test/browser-env';
import { readPersistedState } from '../test/local-storage-mock';

let importCounter = 0;
function nextId() {
  importCounter += 1;
  return importCounter;
}

describe('useSelectedOrgStore', () => {
  beforeEach(() => {
    installBrowserEnv();
  });

  afterEach(() => {
    uninstallBrowserEnv();
  });

  it('starts with no selected org', async () => {
    const { useSelectedOrgStore } = (await import(
      `./selected-org-store.ts?v=${nextId()}`
    )) as typeof import('./selected-org-store');

    expect(useSelectedOrgStore.getState().selectedOrgId).toBeNull();
  });

  it('sets and clears the selected org', async () => {
    const { useSelectedOrgStore } = (await import(
      `./selected-org-store.ts?v=${nextId()}`
    )) as typeof import('./selected-org-store');

    useSelectedOrgStore.getState().setSelectedOrgId('org-123');
    expect(useSelectedOrgStore.getState().selectedOrgId).toBe('org-123');

    useSelectedOrgStore.getState().clearOrg();
    expect(useSelectedOrgStore.getState().selectedOrgId).toBeNull();
  });

  it('persists selectedOrgId to localStorage', async () => {
    const { useSelectedOrgStore } = (await import(
      `./selected-org-store.ts?v=${nextId()}`
    )) as typeof import('./selected-org-store');

    useSelectedOrgStore.getState().setSelectedOrgId('org-456');

    const persistedState = readPersistedState('chronicle-selected-org');
    expect(persistedState).toEqual({ selectedOrgId: 'org-456' });
  });

  it('switching orgs updates the value', async () => {
    const { useSelectedOrgStore } = (await import(
      `./selected-org-store.ts?v=${nextId()}`
    )) as typeof import('./selected-org-store');

    useSelectedOrgStore.getState().setSelectedOrgId('org-A');
    expect(useSelectedOrgStore.getState().selectedOrgId).toBe('org-A');

    useSelectedOrgStore.getState().setSelectedOrgId('org-B');
    expect(useSelectedOrgStore.getState().selectedOrgId).toBe('org-B');
  });
});
