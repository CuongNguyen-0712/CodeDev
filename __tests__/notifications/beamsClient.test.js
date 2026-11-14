// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Browser side of web push (docs/superpowers/specs/2026-11-07-beams-web-push-design.md 6.2):
 * the device is bound to one user's public id, only after that user turned push on, and a
 * signed-out page or another user unbinds it.
 */
const sdk = {
    start: vi.fn(async () => {}),
    setUserId: vi.fn(async () => {}),
    getUserId: vi.fn(async () => null),
    stop: vi.fn(async () => {}),
    _deviceStateStore: { clear: vi.fn(async () => {}) },
    _deviceId: "d1",
};
const gone = () => new Error("Unexpected status code 404: Not Found, device not found");
vi.mock("@pusher/push-notifications-web", () => ({
    Client: vi.fn(function Client() { return sdk; }),
}));
const setWebPushStop = vi.fn();
vi.mock("@/lib/authNavigation", () => ({ setWebPushStop: (...a) => setWebPushStop(...a) }));
// The Beams token goes through the expired-access retry (docs/superpowers/specs/2026-11-14-realtime-auth-retry-design.md).
const fetchWithAuthRetry = vi.hoisted(() => vi.fn());
vi.mock("@/lib/authRefresh", () => ({ fetchWithAuthRetry: (...a) => fetchWithAuthRetry(...a) }));
const withTokenProvider = expect.objectContaining({ fetchToken: expect.any(Function) });

let client;
let permission;
const subscription = { unsubscribe: vi.fn(async () => true) };

beforeEach(async () => {
    vi.clearAllMocks();
    // clearAllMocks keeps implementations: tests that drive the token provider set their own.
    sdk.setUserId.mockImplementation(async () => {});
    sdk.getUserId.mockResolvedValue(null);
    sdk._deviceId = "d1";
    localStorage.clear();
    permission = "default";
    vi.stubEnv("NEXT_PUBLIC_BEAMS_INSTANCE_ID", "inst");
    vi.stubGlobal("Notification", {
        get permission() { return permission; },
        requestPermission: vi.fn(async () => permission),
    });
    vi.stubGlobal("PushManager", function PushManager() {});
    subscription.unsubscribe.mockClear();
    Object.defineProperty(navigator, "serviceWorker", {
        value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => subscription } }) },
        configurable: true,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.resetModules();
    client = await import("@/lib/beamsClient");
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("webPushState", () => {
    it("unsupported without the instance id or PushManager", async () => {
        expect(client.webPushState("P1")).toBe("off");
        vi.stubEnv("NEXT_PUBLIC_BEAMS_INSTANCE_ID", "");
        expect(client.webPushState("P1")).toBe("unsupported");
        vi.stubEnv("NEXT_PUBLIC_BEAMS_INSTANCE_ID", "inst");
        vi.stubGlobal("PushManager", undefined);
        delete window.PushManager;
        expect(client.webPushState("P1")).toBe("unsupported");
    });

    it("storage errors do not throw", () => {
        permission = "granted";
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
        expect(client.webPushState("P1")).toBe("off");
    });
});

describe("enableWebPush", () => {
    it("asks permission, binds the device and sets the flag", async () => {
        permission = "granted";
        expect(await client.enableWebPush("P1")).toBe("on");
        expect(Notification.requestPermission).toHaveBeenCalled();
        expect(sdk.start).toHaveBeenCalled();
        expect(sdk.setUserId).toHaveBeenCalledWith("P1", withTokenProvider);
        expect(localStorage.getItem("webpush:P1")).toBe("1");
        expect(client.webPushState("P1")).toBe("on");
        expect(setWebPushStop).toHaveBeenCalledWith(client.stopWebPush);
    });

    it("when denied: blocked, nothing bound, no flag", async () => {
        permission = "denied";
        expect(await client.enableWebPush("P1")).toBe("blocked");
        expect(sdk.start).not.toHaveBeenCalled();
        expect(localStorage.getItem("webpush:P1")).toBeNull();
    });

    it("fetches the Beams token through the auth retry helper", async () => {
        permission = "granted";
        fetchWithAuthRetry.mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "t" }) });
        sdk.setUserId.mockImplementation(async (id, provider) => provider.fetchToken(id));
        expect(await client.enableWebPush("P 1")).toBe("on");
        expect(fetchWithAuthRetry).toHaveBeenCalledWith("/api/pusher/beams-auth?user_id=P%201", expect.objectContaining({ method: "GET" }));
        expect(await sdk.setUserId.mock.results[0].value).toEqual({ token: "t" });
    });

    it("a token request that still fails throws with its status", async () => {
        permission = "granted";
        fetchWithAuthRetry.mockResolvedValue({ ok: false, status: 401, json: async () => ({ code: "UNAUTHENTICATED" }) });
        sdk.setUserId.mockImplementation(async (id, provider) => provider.fetchToken(id));
        await expect(client.enableWebPush("P1")).rejects.toMatchObject({ status: 401 });
        expect(localStorage.getItem("webpush:P1")).toBeNull();
    });

    it("rethrows an SDK error so Settings can say so", async () => {
        permission = "granted";
        sdk.start.mockRejectedValueOnce(new Error("sw failed"));
        await expect(client.enableWebPush("P1")).rejects.toThrow("sw failed");
        expect(localStorage.getItem("webpush:P1")).toBeNull();
    });
});

describe("a device Beams already deleted (remote revoke)", () => {
    it("enable re-registers when setUserId gets a 404", async () => {
        permission = "granted";
        sdk.setUserId.mockRejectedValueOnce(gone());
        expect(await client.enableWebPush("P1")).toBe("on");
        expect(sdk._deviceStateStore.clear).toHaveBeenCalled();
        expect(sdk._deviceId).toBeNull();
        // A real Beams instance refuses the old push subscription (401 "Subscription is not
        // registered with the given push service"): it must be dropped before start() again.
        expect(subscription.unsubscribe).toHaveBeenCalled();
        expect(subscription.unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(sdk.start.mock.invocationCallOrder[1]);
        expect(sdk.start).toHaveBeenCalledTimes(2);
        expect(sdk.setUserId).toHaveBeenCalledTimes(2);
    });

    it("resume re-subscribes when Beams refuses the old push subscription", async () => {
        permission = "granted";
        localStorage.setItem("webpush:P1", "1");
        sdk.start.mockRejectedValueOnce(new Error("Unexpected status code 401: Token error, Subscription is not registered with the given push service"));
        await client.resumeWebPush("P1");
        expect(subscription.unsubscribe).toHaveBeenCalled();
        expect(sdk.start).toHaveBeenCalledTimes(2);
        expect(sdk.setUserId).toHaveBeenCalledWith("P1", withTokenProvider);
    });

    it("resume re-registers when setUserId gets a 404", async () => {
        permission = "granted";
        localStorage.setItem("webpush:P1", "1");
        sdk.setUserId.mockRejectedValueOnce(gone());
        await client.resumeWebPush("P1");
        expect(sdk.setUserId).toHaveBeenCalledTimes(2);
    });

    it("a 404 on stop counts as unbound", async () => {
        permission = "granted";
        localStorage.setItem("webpush:P1", "1");
        sdk.stop.mockRejectedValueOnce(gone());
        await client.disableWebPush("P1");
        expect(sdk._deviceStateStore.clear).toHaveBeenCalled();
        expect(localStorage.getItem("webpush:P1")).toBeNull();
    });
});

describe("disableWebPush", () => {
    it("keeps the switch on when Beams cannot be reached, so the unbind is not lost", async () => {
        permission = "granted";
        localStorage.setItem("webpush:P1", "1");
        sdk.stop.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        await expect(client.disableWebPush("P1")).rejects.toThrow("Failed to fetch");
        expect(localStorage.getItem("webpush:P1")).toBe("1");
    });

    it("stops and clears the flag", async () => {
        permission = "granted";
        localStorage.setItem("webpush:P1", "1");
        await client.disableWebPush("P1");
        expect(sdk.stop).toHaveBeenCalled();
        expect(localStorage.getItem("webpush:P1")).toBeNull();
        expect(client.webPushState("P1")).toBe("off");
    });
});

describe("resumeWebPush", () => {
    it("does nothing without granted permission", async () => {
        localStorage.setItem("webpush:P1", "1");
        permission = "denied";
        await client.resumeWebPush("P1");
        expect(sdk.start).not.toHaveBeenCalled();
    });

    it("rebinds the opted-in user", async () => {
        permission = "granted";
        localStorage.setItem("webpush:P1", "1");
        await client.resumeWebPush("P1");
        expect(sdk.start).toHaveBeenCalled();
        expect(sdk.setUserId).toHaveBeenCalledWith("P1", withTokenProvider);
    });

    it("resumeWebPush fetches the token through the auth retry helper", async () => {
        // The expired-access refresh and retry themselves are covered in fetchWithAuthRetry.test.js.
        permission = "granted";
        localStorage.setItem("webpush:P1", "1");
        fetchWithAuthRetry.mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "t" }) });
        sdk.setUserId.mockImplementation(async (id, provider) => provider.fetchToken(id));
        await client.resumeWebPush("P1");
        expect(fetchWithAuthRetry).toHaveBeenCalledTimes(1);
        expect(console.error).not.toHaveBeenCalled();
    });

    it("a 404 from the token endpoint does not forget the device", async () => {
        // Only Beams saying the device is gone resets it; our own route answering 404 does not.
        permission = "granted";
        localStorage.setItem("webpush:P1", "1");
        fetchWithAuthRetry.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
        sdk.setUserId.mockImplementation(async (id, provider) => provider.fetchToken(id));
        await client.resumeWebPush("P1");
        expect(sdk._deviceStateStore.clear).not.toHaveBeenCalled();
        expect(subscription.unsubscribe).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledWith("[Beams Client] resume failed:", "Beams token request failed (404)");
    });

    it("for another user stops the old binding and does not opt in", async () => {
        permission = "granted";
        localStorage.setItem("webpush:P1", "1");
        sdk.getUserId.mockResolvedValue("P1");
        await client.resumeWebPush("P2");
        expect(sdk.stop).toHaveBeenCalled();
        expect(sdk.setUserId).not.toHaveBeenCalled();
    });

    it("on a signed-out page unbinds a leftover device", async () => {
        permission = "granted";
        localStorage.setItem("webpush:P1", "1");
        sdk.getUserId.mockResolvedValue("P1");
        await client.resumeWebPush(null);
        expect(sdk.stop).toHaveBeenCalled();
        expect(sdk.setUserId).not.toHaveBeenCalled();
        expect(localStorage.getItem("webpush:P1")).toBe("1");
    });

    it("never loads the SDK for someone who never opted in", async () => {
        permission = "granted";
        const { Client } = await import("@pusher/push-notifications-web");
        await client.resumeWebPush(null);
        await client.resumeWebPush("P2");
        expect(Client).not.toHaveBeenCalled();
    });
});

describe("stopWebPush", () => {
    it("stops a loaded SDK and keeps the flag", async () => {
        permission = "granted";
        await client.enableWebPush("P1");
        await client.stopWebPush();
        expect(sdk.stop).toHaveBeenCalled();
        expect(localStorage.getItem("webpush:P1")).toBe("1");
    });
});
