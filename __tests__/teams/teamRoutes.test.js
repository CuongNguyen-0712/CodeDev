// Team GET routes with the service mocked: parameters passed down, envelope, errors from the service.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/error/apiError";

const svc = vi.hoisted(() => ({ members: vi.fn(), listInvitations: vi.fn() }));
vi.mock("@/services/team.service", () => ({ teamService: svc }));
vi.mock("@/lib/session", () => ({ requireAuthSession: async () => ({ user: { id: "usr_1" } }), getAuthSession: async () => null }));
vi.mock("@/lib/rateLimit", () => ({ rateLimiters: { api: { limitRequest: async () => ({ allowed: true, headers: {} }) } } }));

import { GET as members } from "@/app/api/teams/[id]/members/route";
import { GET as invitations } from "@/app/api/teams/invitations/route";

const req = (path = "x") => new Request(`http://localhost/api/teams/${path}`);

beforeEach(() => vi.resetAllMocks());

describe("team GET routes", () => {
    it("members passes the team id and returns the envelope", async () => {
        svc.members.mockResolvedValue({ team: { id: "team_a", name: "N" }, items: [] });
        const res = await members(req("team_a/members"), { params: Promise.resolve({ id: "team_a" }) });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, data: { team: { id: "team_a", name: "N" }, items: [] } });
        expect(svc.members).toHaveBeenCalledWith({ userId: "usr_1", teamId: "team_a" });
    });

    it("members maps service errors (400 bad id, 404 not a member)", async () => {
        for (const status of [400, 404]) {
            svc.members.mockRejectedValue(new ApiError("x", status));
            expect((await members(req("t/members"), { params: Promise.resolve({ id: "t" }) })).status).toBe(status);
        }
    });

    it("invitations passes the cursor, null when absent, and maps a bad cursor to 400", async () => {
        svc.listInvitations.mockResolvedValue({ items: [], nextCursor: null });
        expect((await invitations(req("invitations?cursor=abc"))).status).toBe(200);
        expect(svc.listInvitations).toHaveBeenLastCalledWith({ userId: "usr_1", cursor: "abc" });
        await invitations(req("invitations"));
        expect(svc.listInvitations).toHaveBeenLastCalledWith({ userId: "usr_1", cursor: null });
        svc.listInvitations.mockRejectedValue(new ApiError("Invalid cursor", 400));
        expect((await invitations(req("invitations?cursor=!"))).status).toBe(400);
    });
});
