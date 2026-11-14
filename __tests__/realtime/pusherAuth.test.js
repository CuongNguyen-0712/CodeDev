import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Channel auth in lib/pusherClient (docs/superpowers/specs/2026-11-14-realtime-auth-retry-design.md):
 * pusher-js authorizes through fetchWithAuthRetry, so a tab reopened after idle refreshes its
 * expired access state instead of losing the channel; a channel that failed anyway subscribes
 * again on the next acquire and on the next `refreshed` auth event.
 */
const ctor = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ fetchWithAuthRetry: vi.fn(), onAuthEvent: vi.fn(), stop: vi.fn(), listener: null }));

vi.mock("pusher-js", () => ({ default: ctor }));
vi.mock("@/lib/authNavigation", () => ({ setRealtimeDisconnect: vi.fn() }));
vi.mock("@/lib/authRefresh", () => ({
    fetchWithAuthRetry: (...a) => auth.fetchWithAuthRetry(...a),
    onAuthEvent: (...a) => auth.onAuthEvent(...a),
}));

let mod;
let pusher;
let channels;

const channel = (state = {}) => ({ subscribed: false, subscriptionPending: false, ...state });

beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("window", {});
    vi.stubEnv("NEXT_PUBLIC_PUSHER_KEY", "k");
    channels = {};
    pusher = {
        connection: { state: "connected", bind: vi.fn() },
        channel: vi.fn((name) => channels[name]),
        subscribe: vi.fn((name) => {
            channels[name] = channels[name] || channel({ subscriptionPending: true });
            return channels[name];
        }),
        unsubscribe: vi.fn((name) => { delete channels[name]; }),
        disconnect: vi.fn(),
    };
    ctor.mockImplementation(function Pusher() { return pusher; });
    auth.onAuthEvent.mockImplementation((listener) => {
        auth.listener = listener;
        return auth.stop;
    });
    mod = await import("@/lib/pusherClient");
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

const handler = () => {
    mod.getPusherClient();
    return ctor.mock.calls[0][1].channelAuthorization.customHandler;
};

describe("channel authorization", () => {
    it("authorizes channels with a custom handler posting form data", async () => {
        const customHandler = handler();
        auth.fetchWithAuthRetry.mockResolvedValue({ ok: true, status: 200, json: async () => ({ auth: "k:sig" }) });
        const callback = vi.fn();
        await customHandler({ socketId: "1.2", channelName: "private-user-u1" }, callback);
        const [url, init] = auth.fetchWithAuthRetry.mock.calls[0];
        expect(url).toBe("/api/pusher/auth");
        expect(init.method).toBe("POST");
        expect(String(init.body)).toBe("socket_id=1.2&channel_name=private-user-u1");
        expect(callback).toHaveBeenCalledWith(null, { auth: "k:sig" });
    });

    it("passes a non-2xx status to the callback as an error", async () => {
        const customHandler = handler();
        auth.fetchWithAuthRetry.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
        const callback = vi.fn();
        await customHandler({ socketId: "1.2", channelName: "private-user-u2" }, callback);
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }), null);
        expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it("passes a network error to the callback", async () => {
        const customHandler = handler();
        const offline = new TypeError("Failed to fetch");
        auth.fetchWithAuthRetry.mockRejectedValue(offline);
        const callback = vi.fn();
        await expect(customHandler({ socketId: "1.2", channelName: "private-user-u1" }, callback)).resolves.toBeUndefined();
        expect(callback).toHaveBeenCalledWith(offline, null);
    });
});

describe("resubscribing failed channels", () => {
    it("acquireChannel resubscribes a channel that failed", () => {
        mod.getPusherClient();
        channels["private-user-u1"] = channel();
        mod.acquireChannel("private-user-u1");
        expect(pusher.subscribe).toHaveBeenCalledWith("private-user-u1");
    });

    it("acquireChannel leaves a pending or subscribed channel alone", () => {
        mod.getPusherClient();
        channels["private-user-u1"] = channel({ subscriptionPending: true });
        channels.broadcast = channel({ subscribed: true });
        mod.acquireChannel("private-user-u1");
        mod.acquireChannel("broadcast");
        expect(pusher.subscribe).not.toHaveBeenCalled();
    });

    it("resubscribes held failed channels on refreshed", () => {
        mod.acquireChannel("private-user-u1");
        mod.acquireChannel("broadcast");
        mod.releaseChannel("broadcast");
        channels["private-user-u1"] = channel();
        channels.broadcast = channel();
        pusher.subscribe.mockClear();

        auth.listener({ type: "refreshed" });
        expect(pusher.subscribe).toHaveBeenCalledTimes(1);
        expect(pusher.subscribe).toHaveBeenCalledWith("private-user-u1");

        pusher.subscribe.mockClear();
        auth.listener({ type: "logged-out" });
        expect(pusher.subscribe).not.toHaveBeenCalled();
    });

    it("stops listening for refreshed after disconnectPusher", () => {
        mod.acquireChannel("private-user-u1");
        const listener = auth.listener;
        mod.disconnectPusher();
        expect(auth.stop).toHaveBeenCalled();

        ctor.mockClear();
        pusher.subscribe.mockClear();
        listener({ type: "refreshed" });
        expect(ctor).not.toHaveBeenCalled();
        expect(pusher.subscribe).not.toHaveBeenCalled();
    });
});
