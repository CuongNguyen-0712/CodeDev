// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { useUiStore } from "@/stores/uiStore";

const KEY = "codedev_dashboard_state";
const setWidth = (px) => Object.defineProperty(window, "innerWidth", { configurable: true, value: px });

beforeEach(() => {
    useUiStore.setState(useUiStore.getInitialState());
    localStorage.clear();
    setWidth(1280);
});

describe("uiStore sidebar", () => {
    it("starts open, matching the server render", () => {
        expect(useUiStore.getState().isSidebarOpen).toBe(true);
    });

    it("hydrate reads a collapsed sidebar saved on desktop", () => {
        localStorage.setItem(KEY, "false");
        useUiStore.getState().hydrate();
        expect(useUiStore.getState().isSidebarOpen).toBe(false);
    });

    it("hydrate below the breakpoint closes the sidebar and writes nothing", () => {
        setWidth(500);
        localStorage.setItem(KEY, "true");
        useUiStore.getState().hydrate();
        expect(useUiStore.getState().isSidebarOpen).toBe(false);
        expect(localStorage.getItem(KEY)).toBe("true");
    });

    it("hydrate keeps the default when storage holds garbage", () => {
        localStorage.setItem(KEY, "{not json");
        useUiStore.getState().hydrate();
        expect(useUiStore.getState().isSidebarOpen).toBe(true);
    });

    it("setSidebarOpen persists on desktop and accepts an updater", () => {
        useUiStore.getState().setSidebarOpen((open) => !open);
        expect(useUiStore.getState().isSidebarOpen).toBe(false);
        expect(localStorage.getItem(KEY)).toBe("false");
    });

    it("setSidebarOpen below the breakpoint changes state without persisting", () => {
        setWidth(500);
        useUiStore.getState().setSidebarOpen(false);
        expect(useUiStore.getState().isSidebarOpen).toBe(false);
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it("an unchanged value keeps the same state object (no re-render)", () => {
        const before = useUiStore.getState();
        useUiStore.getState().setSidebarOpen(true);
        expect(useUiStore.getState()).toBe(before);
    });

    it("closeSidebarOnMobile only acts below the breakpoint", () => {
        useUiStore.getState().closeSidebarOnMobile();
        expect(useUiStore.getState().isSidebarOpen).toBe(true);
        setWidth(500);
        useUiStore.getState().closeSidebarOnMobile();
        expect(useUiStore.getState().isSidebarOpen).toBe(false);
    });
});
