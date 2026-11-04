// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { useThemeStore } from "@/stores/themeStore";

const stubPrefersDark = (dark) => {
    window.matchMedia = (query) => ({
        matches: dark && query === "(prefers-color-scheme: dark)",
        addEventListener() { },
        removeEventListener() { },
    });
};

beforeEach(() => {
    useThemeStore.setState(useThemeStore.getInitialState());
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    delete document.startViewTransition;
    stubPrefersDark(false);
});

describe("themeStore", () => {
    it("starts light, matching the server render", () => {
        expect(useThemeStore.getState().theme).toBe("light");
    });

    it("hydrate reads the saved theme", () => {
        localStorage.setItem("theme", "dark");
        useThemeStore.getState().hydrate();
        expect(useThemeStore.getState().theme).toBe("dark");
    });

    it("hydrate follows the OS setting when nothing is saved", () => {
        stubPrefersDark(true);
        useThemeStore.getState().hydrate();
        expect(useThemeStore.getState().theme).toBe("dark");
    });

    it("a saved light theme wins over a dark OS setting", () => {
        stubPrefersDark(true);
        localStorage.setItem("theme", "light");
        useThemeStore.getState().hydrate();
        expect(useThemeStore.getState().theme).toBe("light");
    });

    it("toggleTheme without View Transitions flips state, html class and storage at once", () => {
        useThemeStore.getState().toggleTheme();
        expect(useThemeStore.getState().theme).toBe("dark");
        expect(document.documentElement.classList.contains("dark")).toBe(true);
        expect(localStorage.getItem("theme")).toBe("dark");

        useThemeStore.getState().toggleTheme();
        expect(useThemeStore.getState().theme).toBe("light");
        expect(document.documentElement.classList.contains("dark")).toBe(false);
        expect(localStorage.getItem("theme")).toBe("light");
    });
});
