import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Zustand store for the currently selected organization.
 *
 * Migration reference: replaces the legacy Redux pattern in
 * `containers/app/reducers/` which used Immutable.js + redux-reqseq to
 * manage `selectedOrgId`. The legacy saga (`switchOrganization`) navigated
 * to root and re-initialized the app; here, consumers react to the store
 * value directly and RTK Query cache invalidation handles data refresh.
 *
 * Legacy files replaced:
 *   - containers/app/actions/index.ts        (SWITCH_ORGANIZATION action)
 *   - containers/app/reducers/index.ts       (app reducer)
 *   - containers/app/reducers/switchOrganizationReducer.ts
 *   - containers/app/reducers/initializeApplicationReducer.ts
 *   - containers/app/sagas/switchOrganization.ts
 *   - core/redux/selectors/selectSelectedOrgId.ts
 *   - common/utils/storeOrganizationId.ts
 *   - common/utils/getOrgIdFromStorage.ts
 */

type SelectedOrgState = {
  /** Clear the selected org (e.g. on logout). */
  clearOrg: () => void;
  /** The ID of the currently selected organization, or null if none. */
  selectedOrgId: string | null;
  /** Switch to a different organization. */
  setSelectedOrgId: (orgId: string) => void;
};

export const useSelectedOrgStore = create<SelectedOrgState>()(
  persist(
    (set) => ({
      clearOrg: () => set({ selectedOrgId: null }),
      selectedOrgId: null,
      setSelectedOrgId: (orgId) => set({ selectedOrgId: orgId }),
    }),
    {
      name: 'chronicle-selected-org',
      partialize: (state) => ({
        selectedOrgId: state.selectedOrgId,
      }),
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
