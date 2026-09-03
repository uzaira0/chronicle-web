import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const UI_SHELL_STORAGE_KEY = 'chronicle-ui-shell';

type UiShellState = {
  closeMobileNav: () => void;
  isMobileNavOpen: boolean;
  isSidebarCollapsed: boolean;
  isStatusDialogOpen: boolean;
  setMobileNavOpen: (value: boolean) => void;
  setSidebarCollapsed: (value: boolean) => void;
  setStatusDialogOpen: (value: boolean) => void;
  toggleSidebar: () => void;
};

export const useUiShellStore = create<UiShellState>()(
  persist(
    (set) => ({
      closeMobileNav: () => set({ isMobileNavOpen: false }),
      isMobileNavOpen: false,
      isSidebarCollapsed: false,
      isStatusDialogOpen: true,
      setMobileNavOpen: (value) => set({ isMobileNavOpen: value }),
      setSidebarCollapsed: (value) => set({ isSidebarCollapsed: value }),
      setStatusDialogOpen: (value) => set({ isStatusDialogOpen: value }),
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
    }),
    {
      name: UI_SHELL_STORAGE_KEY,
      partialize: (state) => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
        isStatusDialogOpen: state.isStatusDialogOpen,
      }),
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
