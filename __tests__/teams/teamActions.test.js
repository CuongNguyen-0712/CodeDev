// Team server actions: session user, team limiter, 400 from the service validation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/serverAction", () => ({
    runAction: async (handler, options) => {
        try {
            return { success: true, data: await handler({ userId: "u1" }), options };
        } catch (error) {
            return { success: false, status: error.status, message: error.message };
        }
    },
}));

const a = await import("@/actions/team.actions");
const { teamService } = await import("@/services/team.service");
const { rateLimiters } = await import("@/lib/rateLimit");

const TEAM = "team_" + "a".repeat(26);

describe("team actions", () => {
    beforeEach(() => {
        for (const m of ["create", "invite", "respond", "removeMember", "rename", "leave"]) vi.spyOn(teamService, m).mockResolvedValue({ team: { id: TEAM } });
    });
    afterEach(() => vi.restoreAllMocks());

    it.each([
        ["createTeamAction", "create", [{ name: "N", memberIds: ["usr_a"] }], { userId: "u1", name: "N", memberIds: ["usr_a"] }],
        ["inviteToTeamAction", "invite", [{ teamId: TEAM, userIds: ["usr_a"] }], { userId: "u1", teamId: TEAM, userIds: ["usr_a"] }],
        ["respondTeamInviteAction", "respond", [{ teamId: TEAM, accept: true }], { userId: "u1", teamId: TEAM, accept: true }],
        ["removeTeamMemberAction", "removeMember", [{ teamId: TEAM, userId: "usr_t" }], { userId: "u1", teamId: TEAM, targetId: "usr_t" }],
        ["renameTeamAction", "rename", [{ teamId: TEAM, name: "N" }], { userId: "u1", teamId: TEAM, name: "N" }],
        ["leaveTeamAction", "leave", [TEAM], { userId: "u1", teamId: TEAM }],
    ])("%s calls the service with the session user and the team limiter", async (action, method, args, expected) => {
        const r = await a[action](...args);
        expect(teamService[method]).toHaveBeenCalledWith(expected);
        expect(r.success).toBe(true);
        expect(r.options.limiter).toBe(rateLimiters.team);
    });
});

describe("team actions, bad input", () => {
    it.each([
        ["createTeamAction", [{ name: "N", memberIds: [] }]],
        ["createTeamAction", [undefined]],
        ["inviteToTeamAction", [{ teamId: "nope", userIds: ["usr_a"] }]],
        ["respondTeamInviteAction", [{ teamId: TEAM, accept: "yes" }]],
        ["removeTeamMemberAction", [{ teamId: TEAM, userId: "" }]],
        ["renameTeamAction", [{ teamId: TEAM, name: "x".repeat(21) }]],
        ["leaveTeamAction", [5]],
    ])("%s rejects with 400", async (action, args) => {
        expect(await a[action](...args)).toMatchObject({ success: false, status: 400 });
    });
});
