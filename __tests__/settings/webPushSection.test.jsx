// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Settings "Browser notifications" (docs/superpowers/specs/2026-11-07-beams-web-push-design.md 6.4):
 * one switch for this device, with the browser's own limits shown instead of a switch that fails.
 */
let state = "off";
const enableWebPush = vi.fn();
const disableWebPush = vi.fn(async () => {});
const showAlert = vi.fn();

vi.mock("@/lib/beamsClient", () => ({
    webPushState: () => state,
    enableWebPush: (...a) => enableWebPush(...a),
    disableWebPush: (...a) => disableWebPush(...a),
}));
let session = { user: { id: "P1" } };
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session, status: session ? "authenticated" : "loading" }) }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert }) }));

const { default: WebPushSection } = await import("@/components/settings/webPushSection");
const { default: axe } = await import("axe-core");

const toggle = () => screen.getByRole("switch", { name: "Notifications on this device" });

beforeEach(() => {
    vi.clearAllMocks();
    state = "off";
    session = { user: { id: "P1" } };
});
afterEach(cleanup);

describe("WebPushSection", () => {
    it("shows a loading skeleton until the device state is read", () => {
        session = null;
        render(<WebPushSection />);
        expect(screen.getByRole("status", { name: "Loading browser notifications" })).toBeTruthy();
        expect(screen.queryByRole("switch")).toBeNull();
    });

    it("shows unsupported state", async () => {
        state = "unsupported";
        render(<WebPushSection />);
        expect(await screen.findByText("Not supported on this browser.")).toBeTruthy();
        expect(toggle().disabled).toBe(true);
    });

    it("shows blocked state", async () => {
        state = "blocked";
        render(<WebPushSection />);
        expect(await screen.findByText("Blocked in your browser settings.")).toBeTruthy();
        expect(toggle().disabled).toBe(true);
        expect(toggle().getAttribute("aria-checked")).toBe("false");
    });

    it("turning on calls enableWebPush with the public id and shows on", async () => {
        render(<WebPushSection />);
        await screen.findByText("Off: new notifications only appear in your inbox.");
        enableWebPush.mockImplementation(async () => { state = "on"; return "on"; });
        fireEvent.click(toggle());
        await screen.findByText("On: this device shows a notification when CodeDev is not open.");
        expect(enableWebPush).toHaveBeenCalledWith("P1");
        expect(toggle().getAttribute("aria-checked")).toBe("true");
    });

    it("turning off calls disableWebPush", async () => {
        state = "on";
        render(<WebPushSection />);
        await screen.findByText("On: this device shows a notification when CodeDev is not open.");
        disableWebPush.mockImplementation(async () => { state = "off"; });
        fireEvent.click(toggle());
        await waitFor(() => expect(disableWebPush).toHaveBeenCalledWith("P1"));
        await screen.findByText("Off: new notifications only appear in your inbox.");
    });

    it("an enable error shows an alert and leaves the switch off", async () => {
        render(<WebPushSection />);
        await screen.findByText("Off: new notifications only appear in your inbox.");
        enableWebPush.mockRejectedValue(new Error("sw failed"));
        fireEvent.click(toggle());
        await waitFor(() => expect(showAlert).toHaveBeenCalledWith(500, "Could not turn on browser notifications"));
        expect(toggle().getAttribute("aria-checked")).toBe("false");
        expect(toggle().disabled).toBe(false);
    });

    it("has no axe violations in any state (contrast is checked in the browser, not jsdom)", async () => {
        for (const next of ["unsupported", "blocked", "on", "off"]) {
            state = next;
            const { container, unmount } = render(<WebPushSection />);
            await screen.findByRole("switch");
            const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
            expect(violations.map((v) => `${next}: ${v.id}`)).toEqual([]);
            unmount();
        }
    });
});
