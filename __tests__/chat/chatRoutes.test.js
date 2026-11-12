// Chat GET routes with the service mocked: envelope, id/param validation, error pass-through, redirect.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/error/apiError";

const svc = vi.hoisted(() => ({
    listConversations: vi.fn(), getConversation: vi.fn(), listMessages: vi.fn(), getMessage: vi.fn(),
    unreadCounts: vi.fn(), listBlocks: vi.fn(), attachmentReadUrl: vi.fn(),
}));
vi.mock("@/services/chat.service", () => ({ chatService: svc }));
vi.mock("@/lib/session", () => ({ requireAuthSession: async () => ({ user: { id: "usr_1" } }), getAuthSession: async () => null }));
vi.mock("@/lib/rateLimit", () => ({ rateLimiters: { api: { limitRequest: async () => ({ allowed: true, headers: {} }) } } }));

import { GET as listConversations } from "@/app/api/chat/conversations/route";
import { GET as getConversation } from "@/app/api/chat/conversations/[id]/route";
import { GET as listMessages } from "@/app/api/chat/conversations/[id]/messages/route";
import { GET as getMessage } from "@/app/api/chat/messages/[id]/route";
import { GET as unread } from "@/app/api/chat/unread/route";
import { GET as blocks } from "@/app/api/chat/blocks/route";
import { GET as attachment } from "@/app/api/chat/attachments/[id]/route";

const ULID = "0123456789abcdefghjkmnpqrs";
const CNV = `cnv_${ULID}`, MSG = `msg_${ULID}`, ATT = `att_${ULID}`;
const req = (qs = "") => new Request(`http://localhost/api/chat/x${qs}`);
const ctx = (id) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.resetAllMocks());

const idRoutes = [
    ["conversation", getConversation, "getConversation", CNV],
    ["messages", listMessages, "listMessages", CNV],
    ["message", getMessage, "getMessage", MSG],
];

describe("chat GET routes", () => {
    it("lists conversations, passes tab and cursor", async () => {
        svc.listConversations.mockResolvedValue({ items: [] });
        const res = await listConversations(req("?tab=requests&cursor=abc"));
        expect(res.status).toBe(200);
        expect(res.headers.get("Cache-Control")).toBe("private, no-store");
        expect(await res.json()).toEqual({ success: true, data: { items: [] } });
        expect(svc.listConversations).toHaveBeenCalledWith({ userId: "usr_1", tab: "requests", cursor: "abc" });
    });

    it("defaults tab to all and rejects others", async () => {
        svc.listConversations.mockResolvedValue({ items: [] });
        await listConversations(req());
        expect(svc.listConversations).toHaveBeenCalledWith({ userId: "usr_1", tab: "all", cursor: null });
        expect((await listConversations(req("?tab=spam"))).status).toBe(400);
    });

    it("service 404 passes through on the list route", async () => {
        svc.listConversations.mockRejectedValue(new ApiError("Not found", 404));
        expect((await listConversations(req())).status).toBe(404);
    });

    it.each(idRoutes)("%s: 200 envelope, 400 bad id, 404 from service", async (_n, GET, fn, id) => {
        svc[fn].mockResolvedValue({ ok: 1 });
        const res = await GET(req(), ctx(id));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, data: { ok: 1 } });
        expect((await GET(req(), ctx("bad"))).status).toBe(400);
        expect((await GET(req(), ctx(id.replace(/^[a-z]+/, "att")))).status).toBe(400);
        svc[fn].mockRejectedValue(new ApiError("Not found", 404));
        expect((await GET(req(), ctx(id))).status).toBe(404);
    });

    it("messages: before is optional, a seq, and bounded to bigint", async () => {
        svc.listMessages.mockResolvedValue({ items: [] });
        await listMessages(req(), ctx(CNV));
        expect(svc.listMessages).toHaveBeenLastCalledWith({ userId: "usr_1", conversationId: CNV, before: null });
        await listMessages(req("?before=42"), ctx(CNV));
        expect(svc.listMessages).toHaveBeenLastCalledWith({ userId: "usr_1", conversationId: CNV, before: "42" });
        for (const before of ["9223372036854775808", "99999999999999999999", "abc", "-1"]) {
            expect((await listMessages(req(`?before=${before}`), ctx(CNV))).status).toBe(400);
        }
        expect((await listMessages(req("?before=9223372036854775807"), ctx(CNV))).status).toBe(200);
    });

    it.each([["unread", unread, "unreadCounts"], ["blocks", blocks, "listBlocks"]])("%s: envelope and 404", async (_n, GET, fn) => {
        svc[fn].mockResolvedValue({ n: 1 });
        const res = await GET(req());
        expect(await res.json()).toEqual({ success: true, data: { n: 1 } });
        svc[fn].mockRejectedValue(new ApiError("Not found", 404));
        expect((await GET(req())).status).toBe(404);
    });

    describe("attachments", () => {
        it("redirects 302 with a private cache header", async () => {
            svc.attachmentReadUrl.mockResolvedValue("https://blob.example/a.png?sig=1");
            const res = await attachment(req(), ctx(ATT));
            expect(res.status).toBe(302);
            expect(res.headers.get("Location")).toBe("https://blob.example/a.png?sig=1");
            expect(res.headers.get("Cache-Control")).toBe("private, max-age=240");
            expect(svc.attachmentReadUrl).toHaveBeenCalledWith({ userId: "usr_1", attachmentId: ATT });
        });

        it("400 bad id, 404 and 503 stay JSON errors", async () => {
            expect((await attachment(req(), ctx(CNV))).status).toBe(400);
            for (const status of [404, 503]) {
                svc.attachmentReadUrl.mockRejectedValue(new ApiError("x", status));
                const res = await attachment(req(), ctx(ATT));
                expect(res.status).toBe(status);
                expect(res.headers.get("Location")).toBeNull();
                expect((await res.json()).success).toBe(false);
            }
        });
    });
});
