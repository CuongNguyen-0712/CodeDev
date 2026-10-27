'use client';

import { useContext, createContext, useState, useEffect } from "react";
import { flushSync } from "react-dom";

const ThemeContext = createContext({
    theme: "light",
    setTheme: () => {},
    toggleTheme: () => {},
});

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState("light");
    const [mounted, setMounted] = useState(false);

    // Hydration-safe: the server renders "light", then the saved theme (already painted by
    // THEME_SCRIPT) is read once on mount. A lazy initial state would mismatch the server HTML.
    useEffect(() => {
        const savedTheme = localStorage.getItem("theme");
        if (savedTheme === "dark" || savedTheme === "light") {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser storage after hydration
            setTheme(savedTheme);
        } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
            setTheme("dark");
        }
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        const root = document.documentElement;
        if (theme === "dark") {
            root.classList.add("dark");
        } else {
            root.classList.remove("dark");
        }
        try {
            localStorage.setItem("theme", theme);
        } catch {
            // ignore localStorage errors (e.g. incognito quota)
        }
    }, [theme, mounted]);

    /**
     * Switches theme with a circle that grows from the click (or the button centre for keyboard
     * use) and covers the screen. View Transitions snapshot the old page; the new one is revealed
     * with clip-path, so it stays on the compositor. Unsupported browsers and reduced motion get an
     * instant switch.
     */
    const toggleTheme = (event) => {
        const next = theme === "dark" ? "light" : "dark";
        const root = document.documentElement;
        const apply = () => {
            root.classList.toggle("dark", next === "dark");
            flushSync(() => setTheme(next));
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
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);

