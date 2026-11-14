import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PusherJs from "pusher-js";

/**
 * lib/pusherClient against the real pusher-js Channel (not a fake): the safety net reads SDK
 * fields (`subscribed`, `subscriptionPending`) and relies on pusher.subscribe resending a failed
 * subscribe. Recheck this file on a pusher-js upgrade.
 */
const auth = vi.hoisted(() => ({ fetchWithAuthRetry: vi.fn(), listener: null }));
vi.mock("@/lib/authNavigation", () => ({ setRealtimeDisconnect: vi.fn() }));
vi.mock("@/lib/authRefresh", () => ({
    fetchWithAuthRetry: (...a) => auth.fetchWithAuthRetry(...a),
    onAuthEvent: (listener) => {
        auth.listener = listener;
        return () => {};
    },
}));

const flush = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};
const denied = () => ({ ok: false, status: 401, headers: new Headers(), json: async () => ({}) });
const granted = () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ auth: "k:sig" }) });

let mod;
let pusher;
let wasReady;

beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("window", {});
    vi.stubEnv("NEXT_PUBLIC_PUSHER_KEY", "k");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    // No socket: the client is built but never connects; the connection is faked as up.
    wasReady = PusherJs.isReady;
    PusherJs.isReady = false;
    mod = await import("@/lib/pusherClient");
    pusher = mod.getPusherClient();
    pusher.connection.state = "connected";
    pusher.connection.socket_id = "1.2";
    pusher.send_event = vi.fn(() => true);
});

afterEach(() => {
    mod.disconnectPusher();
    PusherJs.isReady = wasReady;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("private channel auth with real pusher-js", () => {
    it("a channel whose auth failed subscribes once the session is refreshed", async () => {
        auth.fetchWithAuthRetry.mockResolvedValueOnce(denied()).mockResolvedValueOnce(granted());
        const errors = [];
        const channel = mod.acquireChannel("private-user-u1");
        channel.bind("pusher:subscription_error", (e) => errors.push(e));
        await flush();

        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({ type: "AuthError", error: expect.stringContaining("401") });
        expect(channel.subscribed).toBe(false);
        expect(channel.subscriptionPending).toBe(false);
        expect(pusher.send_event).not.toHaveBeenCalled();

        auth.listener({ type: "refreshed" });
        await flush();
        expect(auth.fetchWithAuthRetry).toHaveBeenCalledTimes(2);
        expect(pusher.send_event).toHaveBeenCalledWith("pusher:subscribe", expect.objectContaining({ auth: "k:sig", channel: "private-user-u1" }));
    });

    it("acquiring a failed channel again sends a new subscribe", async () => {
        auth.fetchWithAuthRetry.mockResolvedValueOnce(denied()).mockResolvedValueOnce(granted());
        mod.acquireChannel("private-user-u1");
        await flush();
        mod.releaseChannel("private-user-u1");
        mod.acquireChannel("private-user-u1");
        await flush();
        expect(pusher.send_event).toHaveBeenCalledWith("pusher:subscribe", expect.objectContaining({ auth: "k:sig", channel: "private-user-u1" }));
    });
});
