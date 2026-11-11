import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { connected: false };
vi.mock("@/lib/pusherClient", () => ({ isPusherConnected: () => state.connected }));
vi.mock("@/clients/chat.client", () => ({ chatClient: {} }));

import { chatQueries } from "@/queries/chat.query";

describe("chatQueries.unread", () => {
    beforeEach(() => { state.connected = false; });
    it("polls every minute while Pusher is not connected, every 5 minutes as a safety net while it is", () => {
        const { refetchInterval } = chatQueries.unread();
        expect(refetchInterval()).toBe(60_000);
        state.connected = true;
        expect(refetchInterval()).toBe(300_000);
    });
});
