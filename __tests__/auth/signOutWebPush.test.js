// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sign out waits (briefly) for web push to unbind before the page unloads: on a shared computer
 * the next person must not get the previous user's notifications.
 */
vi.mock("@/lib/authSignal", () => ({ markSigningOut: vi.fn() }));
vi.mock("@/lib/authRefresh", () => ({ resetAuthRefreshState: vi.fn() }));

let nav;
const replace = vi.fn();

beforeEach(async () => {
    vi.useFakeTimers();
    replace.mockReset();
    vi.stubGlobal("location", { replace });
    vi.resetModules();
    nav = await import("@/lib/authNavigation");
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("leaveSignedOut and web push", () => {
    it("leaves at once when the push SDK was never loaded", () => {
        nav.leaveSignedOut(null, { target: "/" });
        expect(replace).toHaveBeenCalledWith("/");
    });

    it("waits for the unbind before leaving", async () => {
        let done;
        nav.setWebPushStop(() => new Promise((resolve) => { done = resolve; }));
        nav.leaveSignedOut(null, { target: "/" });
        expect(replace).not.toHaveBeenCalled();
        done();
        await vi.advanceTimersByTimeAsync(0);
        expect(replace).toHaveBeenCalledWith("/");
    });

    it("never waits more than 1.5 s", async () => {
        nav.setWebPushStop(() => new Promise(() => {}));
        nav.leaveSignedOut(null, { target: "/" });
        await vi.advanceTimersByTimeAsync(1_499);
        expect(replace).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(replace).toHaveBeenCalledWith("/");
    });
});
