// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

const channel = vi.hoisted(() => ({ options: null }));
vi.mock("next-auth/react", () => ({
    useSession: () => ({ status: "authenticated", data: { user: { id: "me", sessionId: "s1" } } }),
    signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/usePusherChannel", () => ({ usePusherChannel: (_name, _handlers, options) => { if (options) channel.options = options; } }));
vi.mock("@/components/ui/level", () => ({ announceRewards: vi.fn() }));
vi.mock("@/lib/authNavigation", () => ({ LANDING_PATH: "/", leaveSignedOut: vi.fn() }));

import { UserRealtimeBridge } from "@/components/realtime/userRealtimeBridge";
import { teamKeys } from "@/keys/team.keys";

describe("user realtime bridge", () => {
    it("a reconnect invalidates the team queries", () => {
        const qc = new QueryClient();
        qc.setQueryData(teamKeys.invitations(), { pages: [] });
        render(createElement(QueryClientProvider, { client: qc }, createElement(UserRealtimeBridge)));
        channel.options.onReconnect();
        expect(qc.getQueryState(teamKeys.invitations()).isInvalidated).toBe(true);
    });
});
