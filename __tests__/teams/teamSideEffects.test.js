// Notifications and realtime events after team writes, against real PostgreSQL; only the delivery boundaries are mocked.
import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const notify = vi.fn(async () => ({ id: "n" }));
const publishToUser = vi.fn(async () => true);
const publish = vi.fn(async () => true);
vi.mock("@/services/notification.service", () => ({ notificationService: { notify: (...a) => notify(...a) } }));
vi.mock("@/lib/pusher", () => ({ publishToUser: (...a) => publishToUser(...a), publish: (...a) => publish(...a) }));
vi.mock("@/lib/chatMedia", () => ({ remove: vi.fn(async () => { }) }));
// Outside a request the real `after` throws, so runAfter runs its function at once.
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request scope"); } }));

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `ts${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("team side effects", () => {
    let sql, teamService, n = 0;
    const ids = {};
    const newUser = async () => {
        const publicId = `${TAG}_${n++}`;
        const id = String(978000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified, status) VALUES ($1, $2, $2, $3, true, 'active')`, [id, publicId, `${publicId}@test.invalid`]);
        await sql(`INSERT INTO profile.info (user_id, surname, name, show_profile) VALUES ($1, 'T', 'T', true)`, [id]);
        ids[publicId] = id;
        return publicId;
    };
    const befriend = (a, b) => sql(`INSERT INTO community.friend (sender_id, receiver_id, status) VALUES ($1, $2, 'accepted')`, [ids[a], ids[b]]);
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
    const memberRow = async (teamId, who) => (await sql(
        `SELECT updated_at, joined_at FROM community.team_members WHERE team_id = $1 AND user_id = $2`, [teamId, ids[who]])).rows[0];
    const create = (userId, memberIds, name = "Study group") => teamService.create({ userId, name, memberIds });
    const respond = (userId, teamId, accept = true) => teamService.respond({ userId, teamId, accept });
    const byTo = (a, b) => a.to.localeCompare(b.to);
    const teamEvents = () => publishToUser.mock.calls.filter(([, event]) => event === "team-updated")
        .map(([to, , data]) => ({ to, ...data })).sort(byTo);
    // [to, change, userId the change is about]; every event carries the team conversation's id.
    const expectEvents = (teamId, list, conversationId) => {
        expect(teamEvents()).toEqual(list.map(([to, change, userId]) => ({ to, teamId, change, conversationId, userId })).sort(byTo));
        publishToUser.mockClear();
    };

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ teamService } = await import("@/services/team.service"));
    });

    beforeEach(() => {
        notify.mockClear();
        publishToUser.mockReset();
        publishToUser.mockResolvedValue(true);
        publish.mockClear();
    });

    afterAll(async () => {
        if (!sql) return;
        const run = (text) => sql(text, [`${TAG}%`]).catch((error) => console.error("[team test cleanup]", error));
        await run(`DELETE FROM community.conversation c WHERE EXISTS (SELECT 1 FROM community.conversation_member m JOIN identity.users u ON u.id = m.user_id WHERE m.conversation_id = c.id AND u.public_id LIKE $1)`);
        await run(`DELETE FROM identity.users WHERE public_id LIKE $1`);
    });

    it("inviting notifies each invitee once with team_invite", async () => {
        const [host, b, c, d] = await hostWithFriends(3);
        const { team } = await create(host, [b, c]);
        expect(notify).toHaveBeenCalledTimes(2);
        for (const who of [b, c]) {
            expect(notify).toHaveBeenCalledWith(who, {
                kind: "team_invite", title: "New team invitation", message: `${host} invited you to join Study group.`,
                link: "/contact?tab=invitations", dedupeKey: `${team.id}:${(await memberRow(team.id, who)).updated_at.getTime()}`,
            });
        }
        notify.mockClear();
        await teamService.invite({ userId: host, teamId: team.id, userIds: [b, d] }); // b is already pending: skipped
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith(d, expect.objectContaining({
            kind: "team_invite", dedupeKey: `${team.id}:${(await memberRow(team.id, d)).updated_at.getTime()}`,
        }));
    });

    it("a re-invite after a decline notifies again", async () => {
        const [host, b] = await hostWithFriends(1);
        const { team } = await create(host, [b]);
        const firstKey = notify.mock.calls[0][1].dedupeKey;
        await respond(b, team.id, false);
        await new Promise((r) => setTimeout(r, 5)); // updated_at must move on
        await teamService.invite({ userId: host, teamId: team.id, userIds: [b] });
        expect(notify).toHaveBeenCalledTimes(2);
        const secondKey = notify.mock.calls[1][1].dedupeKey;
        expect(secondKey).toBe(`${team.id}:${(await memberRow(team.id, b)).updated_at.getTime()}`);
        expect(secondKey).not.toBe(firstKey);
    });

    it("the host leaving notifies the new host with team_host", async () => {
        const [host, b, c] = await hostWithFriends(2);
        const { team } = await create(host, [b, c]);
        await respond(c, team.id);
        await respond(b, team.id);
        notify.mockClear();
        await teamService.leave({ userId: host, teamId: team.id });
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith(c, {
            kind: "team_host", title: "You're the team host now", message: `${host} left Study group, so you now host the team.`,
            link: `/messages/${team.conversationId}`, dedupeKey: `${team.id}:${(await memberRow(team.id, c)).joined_at.getTime()}`,
        });
    });

    it("decline, leave, remove and rename notify nobody", async () => {
        const [host, b, c, d, e] = await hostWithFriends(4);
        const { team } = await create(host, [b, c, d, e]);
        await respond(b, team.id);
        await respond(e, team.id);
        notify.mockClear();
        await respond(c, team.id, false);
        await teamService.leave({ userId: b, teamId: team.id });
        await teamService.removeMember({ userId: host, teamId: team.id, targetId: d });
        await teamService.removeMember({ userId: host, teamId: team.id, targetId: e });
        await teamService.rename({ userId: host, teamId: team.id, name: "Renamed" });
        await teamService.leave({ userId: host, teamId: team.id }); // last member: the team ends
        expect(notify).not.toHaveBeenCalled();
    });

    it("each change publishes team-updated to the affected users with the right change", async () => {
        const [host, b, c] = await hostWithFriends(2);
        const d = await newUser();
        await befriend(b, d);

        const { team } = await create(host, [b, c]);
        const cnv = team.conversationId;
        const expectTeam = (list) => expectEvents(team.id, list, cnv);
        expectTeam([[host, "invited", b], [b, "invited", b], [c, "invited", b]]);
        await respond(b, team.id);
        expectTeam([[host, "joined", b], [b, "joined", b], [c, "joined", b]]);
        await respond(c, team.id, false); // not a team-updated change
        expectTeam([]);
        await teamService.invite({ userId: host, teamId: team.id, userIds: [c] });
        expectTeam([[host, "invited", c], [b, "invited", c], [c, "invited", c]]);
        await teamService.rename({ userId: host, teamId: team.id, name: "Renamed" });
        expectTeam([[host, "renamed", host], [b, "renamed", host], [c, "renamed", host]]);
        await teamService.removeMember({ userId: host, teamId: team.id, targetId: c }); // pending: invite withdrawn
        expectTeam([[host, "kicked", c], [b, "kicked", c], [c, "kicked", c]]);
        await teamService.invite({ userId: host, teamId: team.id, userIds: [c] });
        await respond(c, team.id);
        publishToUser.mockClear();

        await teamService.leave({ userId: host, teamId: team.id }); // b joined first and becomes host
        expectTeam([[host, "left", host], [b, "host", b], [c, "host", b]]);
        await teamService.removeMember({ userId: b, teamId: team.id, targetId: c });
        expectTeam([[b, "kicked", c], [c, "kicked", c]]);
        await teamService.invite({ userId: b, teamId: team.id, userIds: [d] });
        expectTeam([[b, "invited", d], [d, "invited", d]]);
        await teamService.leave({ userId: b, teamId: team.id }); // nobody approved is left: the team ends for b and the invitee
        expectTeam([[b, "ended", b], [d, "ended", b]]); // the conversation id was read before the team was deleted
    });

    it("rename publishes chat-conversation-updated to approved members", async () => {
        const [host, b, c] = await hostWithFriends(2);
        const { team } = await create(host, [b, c]);
        await respond(b, team.id);
        publish.mockClear();
        await teamService.rename({ userId: host, teamId: team.id, name: "Renamed" });
        const updates = publish.mock.calls.filter(([, event]) => event === "chat-conversation-updated");
        expect(updates).toHaveLength(1);
        expect([...updates[0][0]].sort()).toEqual([`private-user-${b}`, `private-user-${host}`].sort());
        expect(updates[0][2]).toEqual({ conversationId: team.conversationId });
    });

    it("a realtime failure is logged and the result is unchanged", async () => {
        const [host, b] = await hostWithFriends(1);
        const error = vi.spyOn(console, "error").mockImplementation(() => { });
        publishToUser.mockRejectedValue(new Error("pusher down"));
        try {
            const { team } = await create(host, [b]);
            expect(team).toMatchObject({ hostId: host, memberCount: 1, pendingCount: 1, conversationId: expect.stringMatching(/^cnv_/) });
            expect(error).toHaveBeenCalledWith("[runAfter]", expect.objectContaining({ message: "pusher down" }));
            // The notification is not lost because the event failed.
            expect(notify).toHaveBeenCalledTimes(1);
        } finally {
            error.mockRestore();
        }
    });
});
