import { create } from "zustand";

import { MOBILE_BREAKPOINT } from "@/hooks/use-mobile";

const STORAGE_KEY = "codedev_dashboard_state";

/** App shell UI state. Naming and structure rules: docs/state-management.md. */
export const useUiStore = create((set) => ({
    // Persist: localStorage STORAGE_KEY, JSON boolean, written only at >= MOBILE_BREAKPOINT.
    // Starts open, the desktop default, so the server render already shows the labelled sidebar;
    // hydrate() reads the saved value after mount (UX-301: one collapse after load for collapsed users).
    isSidebarOpen: true,

    setSidebarOpen: (value) => set((s) => {
        const next = typeof value === "function" ? value(s.isSidebarOpen) : Boolean(value);
        if (next === s.isSidebarOpen) return s;
        if (window.innerWidth >= MOBILE_BREAKPOINT) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
                return s;
            }
        }
        return { isSidebarOpen: next };
    }),

    // Below the breakpoint the desktop sidebar is hidden (a Sheet is used), so it starts closed.
    hydrate: () => {
        if (window.innerWidth < MOBILE_BREAKPOINT) {
            set({ isSidebarOpen: false });
            return;
        }
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved !== null) set({ isSidebarOpen: Boolean(JSON.parse(saved)) });
        } catch {
            // Unreadable storage keeps the default.
        }
    },

    // Client navigation below the breakpoint closes the sidebar Sheet.
    closeSidebarOnMobile: () => {
        if (window.innerWidth < MOBILE_BREAKPOINT) set({ isSidebarOpen: false });
    },
}));
