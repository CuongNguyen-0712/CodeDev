import { describe, expect, it, vi } from "vitest";

const ctor = vi.hoisted(() => vi.fn());
vi.mock("pusher-js", () => ({ default: ctor }));
vi.mock("@/lib/authNavigation", () => ({ setRealtimeDisconnect: vi.fn() }));

import { isPusherConnected } from "@/lib/pusherClient";

describe("isPusherConnected", () => {
    it("is false and creates no client when none exists", () => {
        vi.stubGlobal("window", {});
        vi.stubEnv("NEXT_PUBLIC_PUSHER_KEY", "k");
        expect(isPusherConnected()).toBe(false);
        expect(ctor).not.toHaveBeenCalled();
    });
});
