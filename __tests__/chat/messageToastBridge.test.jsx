// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The bridge shows the new-message toast from the chat-message event (spec section 4.7). */
const nav = vi.hoisted(() => ({ pathname: "/learning", push: vi.fn() }));
const bound = vi.hoisted(() => ({ handlers: null }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({
    useSession: () => ({ status: "authenticated", data: { user: { id: "u_me", sessionId: "s1" } } }),
    signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: nav.push }) }));
vi.mock("@/hooks/usePusherChannel", () => ({ usePusherChannel: (name, handlers) => { if (name === "private-user-u_me") bound.handlers = handlers; } }));
vi.mock("@/components/ui/level", () => ({ announceRewards: vi.fn() }));
vi.mock("@/components/ui/alert", () => ({ notify }));
vi.mock("@/lib/authNavigation", () => ({ LANDING_PATH: "/", leaveSignedOut: vi.fn() }));

import { UserRealtimeBridge } from "@/components/realtime/userRealtimeBridge";

const event = (over = {}) => ({ conversationId: "cnv_1", conversationKind: "direct", title: "Ada", preview: "hello", messageId: "msg_1", seq: "2", senderId: "u_ada", createdAt: "t1", ...over });
const mount = () => render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(UserRealtimeBridge)));
const fire = (payload) => bound.handlers["chat-message"](payload);

beforeEach(() => { nav.pathname = "/learning"; nav.push.mockReset(); notify.mockReset(); });
afterEach(cleanup);

describe("new-message toast in the user bridge", () => {
    it("shows Name: preview with an Open action to the conversation", async () => {
        mount();
        await fire(event());
        expect(notify).toHaveBeenCalledWith(0, "Ada: hello", expect.objectContaining({ id: "chat-toast:cnv_1", actionLabel: "Open" }));
        notify.mock.calls[0][2].callback();
        expect(nav.push).toHaveBeenCalledWith("/messages/cnv_1");
    });

    it("shows the anonymous request toast that opens the Requests tab", async () => {
        mount();
        await fire({ conversationId: "cnv_1", messageId: "msg_1", seq: "2", createdAt: "t1", toRequest: true });
        expect(notify).toHaveBeenCalledWith(0, "New message request", expect.objectContaining({ id: "chat-toast:cnv_1", actionLabel: "Open" }));
        notify.mock.calls[0][2].callback();
        expect(nav.push).toHaveBeenCalledWith("/messages?tab=requests");
    });

    it("stays quiet on /messages and for my own messages", async () => {
        nav.pathname = "/messages/cnv_9";
        mount();
        await fire(event());
        cleanup();
        nav.pathname = "/learning";
        mount();
        await fire(event({ senderId: "u_me" }));
        expect(notify).not.toHaveBeenCalled();
    });
});
