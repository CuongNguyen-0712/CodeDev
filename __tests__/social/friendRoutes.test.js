// Friend GET routes with the service mocked: parameters passed down, envelope, direction validation.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/error/apiError";

const svc = vi.hoisted(() => ({ listFriends: vi.fn(), listInvitations: vi.fn(), counts: vi.fn() }));
vi.mock("@/services/social.service", () => ({ socialService: svc }));
vi.mock("@/lib/session", () => ({ requireAuthSession: async () => ({ user: { id: "usr_1" } }), getAuthSession: async () => null }));
vi.mock("@/lib/rateLimit", () => ({ rateLimiters: { api: { limitRequest: async () => ({ allowed: true, headers: {} }) } } }));

import { GET as listFriends } from "@/app/api/friends/route";
import { GET as listInvitations } from "@/app/api/friends/invitations/route";
import { GET as counts } from "@/app/api/friends/counts/route";

const req = (qs = "") => new Request(`http://localhost/api/friends/x${qs}`);

beforeEach(() => vi.resetAllMocks());

describe("friend GET routes", () => {
    it("lists friends, passes search and cursor", async () => {
        svc.listFriends.mockResolvedValue({ items: [], nextCursor: null });
        const res = await listFriends(req("?search=ann&cursor=abc"));
        expect(res.status).toBe(200);
        expect(res.headers.get("Cache-Control")).toBe("private, no-store");
        expect(await res.json()).toEqual({ success: true, data: { items: [], nextCursor: null } });
        expect(svc.listFriends).toHaveBeenCalledWith({ userId: "usr_1", search: "ann", cursor: "abc" });

        await listFriends(req(`?search=${"a".repeat(150)}`));
        expect(svc.listFriends).toHaveBeenLastCalledWith({ userId: "usr_1", search: "a".repeat(100), cursor: null });
    });

    it("lists invitations by direction and rejects others with 400", async () => {
        svc.listInvitations.mockResolvedValue({ items: [], nextCursor: null });
        expect((await listInvitations(req("?direction=received&cursor=abc"))).status).toBe(200);
        expect(svc.listInvitations).toHaveBeenLastCalledWith({ userId: "usr_1", direction: "received", cursor: "abc" });
        await listInvitations(req("?direction=sent"));
        expect(svc.listInvitations).toHaveBeenLastCalledWith({ userId: "usr_1", direction: "sent", cursor: null });
        for (const qs of ["?direction=foo", ""]) {
            expect((await listInvitations(req(qs))).status).toBe(400);
        }
        expect(svc.listInvitations).toHaveBeenCalledTimes(2);
    });

    it("counts", async () => {
        svc.counts.mockResolvedValue({ friends: 3, received: 1 });
        const res = await counts(req());
        expect(await res.json()).toEqual({ success: true, data: { friends: 3, received: 1 } });
        expect(svc.counts).toHaveBeenCalledWith({ userId: "usr_1" });
    });

    it("a service 400 (bad cursor) passes through", async () => {
        svc.listFriends.mockRejectedValue(new ApiError("Invalid cursor", 400));
        expect((await listFriends(req("?cursor=x"))).status).toBe(400);
    });
});
