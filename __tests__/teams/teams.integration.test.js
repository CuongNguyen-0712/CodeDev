// Team write rules (create, invite, respond, remove, rename, leave) and the team conversation sync against real PostgreSQL; test users, their teams and conversations are deleted afterwards.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chatMedia", () => ({ remove: vi.fn(async () => { }) }));
// Outside a request the real `after` throws, so runAfter runs inline; a test may swap in a deferring `after` that never runs.
const inline = () => { throw new Error("outside a request scope"); };
let afterImpl = inline;
vi.mock("next/server", () => ({ after: (fn) => afterImpl(fn) }));

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `tm${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("teams (PostgreSQL)", () => {
    let sql, teamService, chatService, n = 0;
    const ids = {};
    const newUser = async ({ status = "active" } = {}) => {
        const publicId = `${TAG}_${n++}`;
        const id = String(977000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified, status) VALUES ($1, $2, $2, $3, true, $4)`, [id, publicId, `${publicId}@test.invalid`, status]);
        await sql(`INSERT INTO profile.info (user_id, surname, name, show_profile) VALUES ($1, 'T', 'T', true)`, [id]);
        ids[publicId] = id;
        return publicId;
    };
    const befriend = (a, b) => sql(`INSERT INTO community.friend (sender_id, receiver_id, status) VALUES ($1, $2, 'accepted')`, [ids[a], ids[b]]);
    /** A host and `count` active friends of theirs. */
    const hostWithFriends = async (count) => {
        const host = await newUser();
        const friends = [];
        for (let i = 0; i < count; i++) {
            const f = await newUser();
            await befriend(host, f);
            friends.push(f);
        }
        return [host, ...friends];
    };
    const memberRows = async (teamId) => Object.fromEntries((await sql(
        `SELECT u.public_id, m.status, m.joined_at, m.updated_at FROM community.team_members m JOIN identity.users u ON u.id = m.user_id WHERE m.team_id = $1`,
        [teamId])).rows.map((r) => [r.public_id, r]));
    const conversationMembers = async (teamId) => Object.fromEntries((await sql(
        `SELECT u.public_id, cm.left_at FROM community.conversation c
         JOIN community.conversation_member cm ON cm.conversation_id = c.id JOIN identity.users u ON u.id = cm.user_id
         WHERE c.team_id = $1`, [teamId])).rows.map((r) => [r.public_id, r.left_at]));
    const teamRow = async (teamId) => (await sql(`SELECT t.name, u.public_id AS host FROM community.team t JOIN identity.users u ON u.id = t.host_id WHERE t.id = $1`, [teamId])).rows[0] || null;
    const create = (userId, memberIds, name = "Study group") => teamService.create({ userId, name, memberIds });
    const respond = (userId, teamId, accept = true) => teamService.respond({ userId, teamId, accept });

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ teamService } = await import("@/services/team.service"));
        ({ chatService } = await import("@/services/chat.service"));
    });

    afterAll(async () => {
        if (!sql) return;
        // Teams cascade from their host and conversations from their team; direct conversations do not.
        const run = (text) => sql(text, [`${TAG}%`]).catch((error) => console.error("[team test cleanup]", error));
        await run(`DELETE FROM community.conversation c WHERE EXISTS (SELECT 1 FROM community.conversation_member m JOIN identity.users u ON u.id = m.user_id WHERE m.conversation_id = c.id AND u.public_id LIKE $1)`);
        await run(`DELETE FROM identity.users WHERE public_id LIKE $1`);
    });

    it("create makes the host approved, invites pending, and a team conversation with the host", async () => {
        const [host, b, c] = await hostWithFriends(2);
        const { team } = await create(host, [b, c, b]);
        expect(team).toEqual({
            id: expect.stringMatching(/^team_[0-9a-z]{26}$/), name: "Study group", hostId: host,
            memberCount: 1, pendingCount: 2, conversationId: expect.stringMatching(/^cnv_[0-9a-z]{26}$/),
        });
        const rows = await memberRows(team.id);
        expect(rows[host]).toMatchObject({ status: "approved", joined_at: expect.any(Date) });
        expect(rows[b]).toMatchObject({ status: "pending", joined_at: null, updated_at: expect.any(Date) });
        expect(rows[c]).toMatchObject({ status: "pending", joined_at: null });
        expect((await sql(`SELECT size FROM community.team WHERE id = $1`, [team.id])).rows[0].size).toBe(5);
        expect(await conversationMembers(team.id)).toEqual({ [host]: null });
        expect((await chatService.listMessages({ userId: host, conversationId: team.conversationId })).items).toEqual([]);
        await expect(chatService.listMessages({ userId: b, conversationId: team.conversationId })).rejects.toMatchObject({ status: 404 });
    });

    it("create fails whole when one invitee is not a friend, blocked, or inactive", async () => {
        const [host, ok, blocked] = await hostWithFriends(2);
        const stranger = await newUser();
        const inactive = await newUser({ status: "inactive" });
        await befriend(host, inactive);
        await sql(`INSERT INTO community.user_block (blocker_id, blocked_id) VALUES ($1, $2)`, [ids[blocked], ids[host]]);

        await expect(create(host, [ok, stranger])).rejects.toMatchObject({ status: 403, message: "Can't invite this person" });
        await expect(create(host, [ok, blocked])).rejects.toMatchObject({ status: 403, message: "Can't invite this person" });
        await expect(create(host, [ok, inactive])).rejects.toMatchObject({ status: 404 });
        await expect(create(host, [ok, `${TAG}_nobody`])).rejects.toMatchObject({ status: 404 });
        await expect(create(host, [host])).rejects.toMatchObject({ status: 403 });
        expect((await sql(`SELECT count(*)::int AS n FROM community.team WHERE host_id = $1`, [ids[host]])).rows[0].n).toBe(0);
        expect((await sql(`SELECT count(*)::int AS n FROM community.team_members WHERE user_id = $1`, [ids[ok]])).rows[0].n).toBe(0);
    });

    it("names of spaces or only bidi controls are 400; 21 characters is 400; 20 is ok", async () => {
        const [host, b, c, d, e, f] = await hostWithFriends(5);
        for (const name of ["   ", "‮⁦‏", " \u0007 \u0085 ", "a".repeat(21), "", 42]) {
            await expect(create(host, [b], name)).rejects.toMatchObject({ status: 400 });
        }
        await expect(create(host, [])).rejects.toMatchObject({ status: 400 });
        await expect(create(host, [b, c, d, e, f])).rejects.toMatchObject({ status: 400 });

        const { team } = await create(host, [b], ` ${"a".repeat(20)} `);
        expect(team.name).toBe("a".repeat(20));
        // Emoji count as one character each, as in varchar(20).
        expect((await teamService.rename({ userId: host, teamId: team.id, name: "😀".repeat(20) })).team.name).toBe("😀".repeat(20));
        expect((await teamService.rename({ userId: host, teamId: team.id, name: "Ma‮ths⁦ " })).team.name).toBe("Maths");
        await expect(teamService.rename({ userId: host, teamId: team.id, name: "‮ " })).rejects.toMatchObject({ status: 400 });
        await expect(teamService.rename({ userId: host, teamId: "team_nope", name: "Ok" })).rejects.toMatchObject({ status: 400 });
        expect((await teamRow(team.id)).name).toBe("Maths");
    });

    it("capacity counts pending: 4/5 plus two parallel single invites ends at 5 and one 409", async () => {
        for (let round = 0; round < 5; round++) {
            const [host, b, c, d, e, f] = await hostWithFriends(5);
            const { team } = await create(host, [b, c, d]);
            const results = await Promise.allSettled([
                teamService.invite({ userId: host, teamId: team.id, userIds: [e] }),
                teamService.invite({ userId: host, teamId: team.id, userIds: [f] }),
            ]);
            expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
            const failed = results.find((r) => r.status === "rejected").reason;
            expect(failed).toMatchObject({ status: 409, message: "This team is full" });
            expect(results.find((r) => r.status === "fulfilled").value.team).toMatchObject({ memberCount: 1, pendingCount: 4 });
            expect(Object.values(await memberRows(team.id)).filter((r) => ["approved", "pending"].includes(r.status))).toHaveLength(5);
        }
    });

    it("invite skips people already approved or pending, and is refused when it would pass 5", async () => {
        const [host, b, c, d, e, f] = await hostWithFriends(5);
        const { team } = await create(host, [b, c]);
        await respond(b, team.id);
        expect((await teamService.invite({ userId: host, teamId: team.id, userIds: [b, c, d] })).team).toMatchObject({ memberCount: 2, pendingCount: 2 });
        await expect(teamService.invite({ userId: host, teamId: team.id, userIds: [e, f] })).rejects.toMatchObject({ status: 409, message: "This team is full" });
        expect((await teamService.invite({ userId: host, teamId: team.id, userIds: [e] })).team).toMatchObject({ memberCount: 2, pendingCount: 3 });
        // Full: re-inviting someone already in is still fine.
        expect((await teamService.invite({ userId: host, teamId: team.id, userIds: [c] })).team).toMatchObject({ pendingCount: 3 });
        await expect(teamService.invite({ userId: host, teamId: team.id, userIds: [] })).rejects.toMatchObject({ status: 400 });
    });

    it("accept joins the conversation; decline is rejected; 409 when no longer pending", async () => {
        const [host, b, c] = await hostWithFriends(2);
        const outsider = await newUser();
        const { team } = await create(host, [b, c]);

        const accepted = await respond(b, team.id, true);
        expect(accepted).toEqual({ team: expect.objectContaining({ id: team.id, memberCount: 2, pendingCount: 1 }), conversationId: team.conversationId });
        expect((await memberRows(team.id))[b]).toMatchObject({ status: "approved", joined_at: expect.any(Date) });
        expect(await conversationMembers(team.id)).toEqual({ [host]: null, [b]: null });
        expect((await chatService.listMessages({ userId: b, conversationId: team.conversationId })).items).toEqual([]);

        expect(await respond(c, team.id, false)).toEqual({ team: null, conversationId: null });
        expect((await memberRows(team.id))[c]).toMatchObject({ status: "rejected", joined_at: null });
        expect(await conversationMembers(team.id)).not.toHaveProperty(c);

        await expect(respond(b, team.id, true)).rejects.toMatchObject({ status: 409 });
        await expect(respond(c, team.id, true)).rejects.toMatchObject({ status: 409 });
        await expect(respond(host, team.id, false)).rejects.toMatchObject({ status: 409 });
        await expect(respond(outsider, team.id, true)).rejects.toMatchObject({ status: 404 });
        await expect(respond(b, `team_${"0".repeat(26)}`, true)).rejects.toMatchObject({ status: 404 });
        await expect(teamService.respond({ userId: b, teamId: team.id, accept: "yes" })).rejects.toMatchObject({ status: 400 });
    });

    it("only the host invites, removes and renames (403 otherwise)", async () => {
        const [host, b, c, d] = await hostWithFriends(3);
        await befriend(b, d);
        const outsider = await newUser();
        const { team } = await create(host, [b, c]);
        await respond(b, team.id);

        await expect(teamService.invite({ userId: b, teamId: team.id, userIds: [d] })).rejects.toMatchObject({ status: 403 });
        await expect(teamService.removeMember({ userId: b, teamId: team.id, targetId: c })).rejects.toMatchObject({ status: 403 });
        await expect(teamService.rename({ userId: b, teamId: team.id, name: "Mine" })).rejects.toMatchObject({ status: 403 });
        // A pending invitee or an outsider is not a member: 404.
        await expect(teamService.rename({ userId: c, teamId: team.id, name: "Mine" })).rejects.toMatchObject({ status: 404 });
        await expect(teamService.invite({ userId: outsider, teamId: team.id, userIds: [d] })).rejects.toMatchObject({ status: 404 });
        await expect(teamService.removeMember({ userId: host, teamId: team.id, targetId: host })).rejects.toMatchObject({ status: 400 });
        await expect(teamService.removeMember({ userId: host, teamId: team.id, targetId: outsider })).rejects.toMatchObject({ status: 404 });

        expect((await teamService.rename({ userId: host, teamId: team.id, name: "Renamed" })).team).toMatchObject({ name: "Renamed", hostId: host });
        expect((await teamRow(team.id)).name).toBe("Renamed");
    });

    it("removing an approved member removes them from the conversation; their listMessages is 404", async () => {
        const [host, b] = await hostWithFriends(1);
        const { team } = await create(host, [b]);
        await respond(b, team.id);
        expect((await teamService.removeMember({ userId: host, teamId: team.id, targetId: b })).team).toMatchObject({ memberCount: 1, pendingCount: 0 });
        expect((await memberRows(team.id))[b]).toMatchObject({ status: "kicked" });
        expect((await conversationMembers(team.id))[b]).toEqual(expect.any(Date));
        await expect(chatService.listMessages({ userId: b, conversationId: team.conversationId })).rejects.toMatchObject({ status: 404 });
        await expect(teamService.removeMember({ userId: host, teamId: team.id, targetId: b })).rejects.toMatchObject({ status: 404 });
    });

    it("a late \"joined\" sync for someone kicked meanwhile leaves them out of the conversation", async () => {
        const [host, b] = await hostWithFriends(1);
        const { team } = await create(host, [b]);
        await respond(b, team.id);
        await teamService.removeMember({ userId: host, teamId: team.id, targetId: b });
        // The accept's join landing after the kick's leave (rule 10 runs both after their commits).
        await chatService.syncTeamMember(team.id, b, "joined");
        expect((await conversationMembers(team.id))[b]).toEqual(expect.any(Date));
        await expect(chatService.listMessages({ userId: b, conversationId: team.conversationId })).rejects.toMatchObject({ status: 404 });
        // A pending invitee is not let in either.
        const [host2, c] = await hostWithFriends(1);
        const second = await create(host2, [c]);
        await chatService.syncTeamMember(second.team.id, c, "joined");
        expect(await conversationMembers(second.team.id)).toEqual({ [host2]: null });
    });

    it("removing a pending invitee withdraws the invite", async () => {
        const [host, b] = await hostWithFriends(1);
        const { team } = await create(host, [b]);
        expect((await teamService.removeMember({ userId: host, teamId: team.id, targetId: b })).team).toMatchObject({ memberCount: 1, pendingCount: 0 });
        expect((await memberRows(team.id))[b]).toMatchObject({ status: "kicked" });
        await expect(respond(b, team.id)).rejects.toMatchObject({ status: 409 });
        expect(await conversationMembers(team.id)).toEqual({ [host]: null });
    });

    it("a member leaving keeps the team; the host leaving makes the earliest-joined member host", async () => {
        const [host, b, c, d] = await hostWithFriends(3);
        const { team } = await create(host, [b, c, d]);
        await respond(c, team.id);
        await respond(b, team.id);
        await respond(d, team.id);

        expect(await teamService.leave({ userId: d, teamId: team.id })).toEqual({ team: null });
        const afterD = await memberRows(team.id);
        expect(afterD[d]).toMatchObject({ status: "left", joined_at: expect.any(Date) });
        expect((await conversationMembers(team.id))[d]).toEqual(expect.any(Date));
        await expect(teamService.leave({ userId: d, teamId: team.id })).rejects.toMatchObject({ status: 404 });

        expect(await teamService.leave({ userId: host, teamId: team.id })).toEqual({ team: null });
        // c accepted before b.
        expect(await teamRow(team.id)).toMatchObject({ host: c });
        expect((await memberRows(team.id))[host]).toMatchObject({ status: "left" });
        const chat = await conversationMembers(team.id);
        expect(chat[host]).toEqual(expect.any(Date));
        expect(chat[b]).toBeNull();
        expect(chat[c]).toBeNull();
        expect((await teamService.rename({ userId: c, teamId: team.id, name: "New host" })).team).toMatchObject({ hostId: c, memberCount: 2 });
    });

    it("the last member leaving deletes the team and its conversation; a pending invitee's accept is then 404", async () => {
        const [host, b] = await hostWithFriends(1);
        const { team } = await create(host, [b]);
        expect(await teamService.leave({ userId: host, teamId: team.id })).toEqual({ team: null });
        expect(await teamRow(team.id)).toBeNull();
        expect((await sql(`SELECT count(*)::int AS n FROM community.conversation WHERE public_id = $1`, [team.conversationId])).rows[0].n).toBe(0);
        expect((await sql(`SELECT count(*)::int AS n FROM community.team_members WHERE team_id = $1`, [team.id])).rows[0].n).toBe(0);
        await expect(respond(b, team.id)).rejects.toMatchObject({ status: 404 });
    });

    it("re-inviting someone who left, declined or was removed resets them to pending", async () => {
        const [host, b, c, d] = await hostWithFriends(3);
        const { team } = await create(host, [b, c, d]);
        await respond(b, team.id);
        await teamService.leave({ userId: b, teamId: team.id });
        await respond(c, team.id, false);
        await teamService.removeMember({ userId: host, teamId: team.id, targetId: d });
        const before = await memberRows(team.id);

        expect((await teamService.invite({ userId: host, teamId: team.id, userIds: [b, c, d] })).team).toMatchObject({ memberCount: 1, pendingCount: 3 });
        const rows = await memberRows(team.id);
        for (const who of [b, c, d]) {
            expect(rows[who].status).toBe("pending");
            expect(rows[who].updated_at.getTime()).toBeGreaterThan(before[who].updated_at.getTime());
        }
        // b sees the team's whole history again on re-joining.
        await respond(b, team.id);
        expect((await conversationMembers(team.id))[b]).toBeNull();
    });

    it("create and accept return the conversation id even when runAfter is deferred (as inside a request)", async () => {
        const [host, b] = await hostWithFriends(1);
        afterImpl = () => { };
        try {
            const { team } = await create(host, [b]);
            expect(team.conversationId).toMatch(/^cnv_[0-9a-z]{26}$/);
            expect(await conversationMembers(team.id)).toEqual({ [host]: null });
            const accepted = await respond(b, team.id);
            expect(accepted).toMatchObject({ conversationId: team.conversationId, team: { conversationId: team.conversationId, memberCount: 2 } });
            expect(await conversationMembers(team.id)).toEqual({ [host]: null, [b]: null });
        } finally {
            afterImpl = inline;
        }
    });

    it("a failed chat call keeps the committed team and returns a null conversation id; accept ensures it again", async () => {
        const [host, b] = await hostWithFriends(1);
        const ensure = vi.spyOn(chatService, "ensureTeamConversation").mockRejectedValueOnce(new Error("chat down"));
        const logged = vi.spyOn(console, "error").mockImplementation(() => { });
        try {
            const { team } = await create(host, [b]);
            expect(team).toMatchObject({ hostId: host, memberCount: 1, pendingCount: 1, conversationId: null });
            expect(await teamRow(team.id)).toMatchObject({ host });
            expect(logged).toHaveBeenCalledWith("[team] joining the team conversation", expect.objectContaining({ message: "chat down" }));

            const accepted = await respond(b, team.id);
            expect(accepted.conversationId).toMatch(/^cnv_[0-9a-z]{26}$/);
            // The host's join was lost with the failed call; b's accept creates the conversation and syncs every approved member.
            expect(await conversationMembers(team.id)).toEqual({ [host]: null, [b]: null });
        } finally {
            ensure.mockRestore();
            logged.mockRestore();
        }
    });
});
