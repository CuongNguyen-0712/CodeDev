import { create } from "zustand";
import { flushSync } from "react-dom";

/** Light / dark theme. Naming and structure rules: docs/state-management.md. */
export const useThemeStore = create((set, get) => ({
    // Persist: localStorage `theme`, raw "light" | "dark", also read by lib/themeScript.js before paint.
    // The server renders "light"; THEME_SCRIPT already painted the saved theme, hydrate() syncs the state.
    theme: "light",

    hydrate: () => {
        let saved = null;
        try {
            saved = localStorage.getItem("theme");
        } catch {
            // Unreadable storage: follow the OS setting.
        }
        const dark = saved === "dark" || (saved !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        set({ theme: dark ? "dark" : "light" });
    },

    /**
     * Switches theme with a circle that grows from the click (or the button centre for keyboard
     * use) and covers the screen. View Transitions snapshot the old page; the new one is revealed
     * with clip-path, so it stays on the compositor. Unsupported browsers and reduced motion get an
     * instant switch.
     */
    toggleTheme: (event) => {
        const next = get().theme === "dark" ? "light" : "dark";
        const root = document.documentElement;
        const apply = () => {
            root.classList.toggle("dark", next === "dark");
            try {
                localStorage.setItem("theme", next);
            } catch {
                // ignore localStorage errors (e.g. incognito quota)
            }
            // The view transition snapshots right after this callback: the new theme must be committed.
            flushSync(() => set({ theme: next }));
        };

        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        // A hidden tab renders no frames, so a view transition would wait there: switch instantly.
        if (!document.startViewTransition || reduce || document.visibilityState !== "visible") {
            apply();
            return;
        }

        // A keyboard "click" has no pointer position: start from the button itself.
        const rect = event?.currentTarget?.getBoundingClientRect?.();
        const fromPointer = event && event.detail > 0;
        const x = fromPointer ? event.clientX : rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
        const y = fromPointer ? event.clientY : rect ? rect.top + rect.height / 2 : 0;
        // Farthest corner, plus a little so the anti-aliased edge clears it.
        const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 8;

        // No colour transitions while the snapshots are taken, or the new view would fade mid-reveal.
        root.classList.add("theme-switching");
        const transition = document.startViewTransition(apply);
        transition.ready.then(() => {
            // Both snapshots exist and every colour is final: re-enabling transitions now animates
            // nothing, and the style recalc happens at the start instead of hitching the last frame.
            root.classList.remove("theme-switching");
            // Revealed area grows with r², so an ease-out radius covers the screen early and then
            // "stalls" on the far corner. This curve keeps the visible edge moving to the end
            // (~97% covered at 85% of the time, whatever the viewport or click point).
            root.animate(
                { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
                { duration: 600, easing: "cubic-bezier(0.4, 0, 0.6, 0.8)", pseudoElement: "::view-transition-new(root)" }
            );
        }).catch(() => {});
        // Safety net: if the page cannot render a frame (window covered or throttled), the browser
        // would hold the old snapshot. Skipping still runs `apply`, just without the reveal.
        const guard = setTimeout(() => transition.skipTransition(), 1000);
        transition.updateCallbackDone.finally(() => clearTimeout(guard)).catch(() => {});
        transition.finished.finally(() => root.classList.remove("theme-switching")).catch(() => {});
    },
}));
