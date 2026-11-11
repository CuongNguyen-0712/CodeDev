import { beforeEach, describe, expect, it, vi } from "vitest";

/** /messages/new?to= (server page): an existing direct conversation opens at once (spec section 9, ruling R31). */
const redirect = vi.fn((url) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); });
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
const findDirectConversationId = vi.fn();
const getConversation = vi.fn();
const getPublicProfile = vi.fn();
let session;

vi.mock("next/navigation", () => ({ redirect: (...a) => redirect(...a), notFound: (...a) => notFound(...a) }));
vi.mock("@/lib/session", () => ({ getAuthSession: async () => session }));
vi.mock("@/services/chat.service", () => ({ chatService: { findDirectConversationId: (...a) => findDirectConversationId(...a), getConversation: (...a) => getConversation(...a) } }));
vi.mock("@/services/profile.service", () => ({ profileService: { getPublicProfile: (...a) => getPublicProfile(...a) } }));
vi.mock("@/components/chat/conversationView", () => ({ NewConversationView: () => null }));

const { default: Page } = await import("@/app/(shell)/messages/new/page");
const open = (to) => Page({ searchParams: Promise.resolve(to === undefined ? {} : { to }) });
const profile = { id: "P2", username: "ada", nickname: "Ada", image: null };

beforeEach(() => {
    vi.clearAllMocks();
    session = { user: { id: "P1" } };
    getPublicProfile.mockResolvedValue(profile);
});

describe("/messages/new", () => {
    it("redirects to the existing direct conversation", async () => {
        findDirectConversationId.mockResolvedValue("cnv_x");
        getConversation.mockResolvedValue({ id: "cnv_x" });
        await expect(open("P2")).rejects.toMatchObject({ url: "/messages/cnv_x" });
        expect(findDirectConversationId).toHaveBeenCalledWith({ userId: "P1", toUserId: "P2" });
        expect(getConversation).toHaveBeenCalledWith({ userId: "P1", conversationId: "cnv_x" });
    });

    it("shows the empty composer when the viewer cannot open it (declined or hidden)", async () => {
        findDirectConversationId.mockResolvedValue("cnv_x");
        getConversation.mockRejectedValue(Object.assign(new Error("Conversation not found"), { status: 404 }));
        const page = await open("P2");
        expect(page.props.recipient).toEqual(profile);
        expect(redirect).not.toHaveBeenCalled();
    });

    it("shows the empty composer when there is no conversation yet", async () => {
        findDirectConversationId.mockResolvedValue(null);
        expect((await open("P2")).props.recipient).toEqual(profile);
        expect(getConversation).not.toHaveBeenCalled();
    });

    it("looks up by the profile's public id, not the raw ?to= (it may be a username)", async () => {
        findDirectConversationId.mockResolvedValue(null);
        await open("ada");
        expect(findDirectConversationId).toHaveBeenCalledWith({ userId: "P1", toUserId: "P2" });
    });

    it("404s for a missing or hidden profile and asks to choose without ?to=", async () => {
        getPublicProfile.mockResolvedValue(null);
        await expect(open("nobody")).rejects.toThrow("NEXT_NOT_FOUND");
        expect((await open()).props.recipient).toBeNull();
    });

    it("rethrows errors other than 404", async () => {
        findDirectConversationId.mockResolvedValue("cnv_x");
        getConversation.mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));
        await expect(open("P2")).rejects.toThrow("boom");
    });
});
