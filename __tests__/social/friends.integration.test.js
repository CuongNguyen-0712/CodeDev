// Friend request rules (send, respond, cancel, remove) and reads (lists, invitations, counts, people search) against real PostgreSQL; test users and their conversations are deleted afterwards.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chatMedia", () => ({ remove: vi.fn(async () => { }) }));
// Outside a request the real `after` throws, so post-commit hooks run inline.
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request scope"); } }));

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `fr${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("friend requests (PostgreSQL)", () => {
    let sql, socialService, chatService, n = 0;
    const ids = {};
    const newUser = async ({ status = "active", showProfile = true } = {}) => {
        const publicId = `${TAG}_${n++}`;
        const id = String(976000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified, status) VALUES ($1, $2, $2, $3, true, $4)`, [id, publicId, `${publicId}@test.invalid`, status]);
        await sql(`INSERT INTO profile.info (user_id, surname, name, show_profile) VALUES ($1, 'T', 'T', $2)`, [id, showProfile]);
        ids[publicId] = id;
        return publicId;
    };
    const pair = async () => [await newUser(), await newUser()];
    const rowsOf = async (a, b) => (await sql(
        `SELECT sender_id::text AS sender, receiver_id::text AS receiver, status, created_at, updated_at FROM community.friend
         WHERE LEAST(sender_id, receiver_id) = LEAST($1::bigint, $2::bigint) AND GREATEST(sender_id, receiver_id) = GREATEST($1::bigint, $2::bigint)`,
        [ids[a], ids[b]])).rows;
    const send = (userId, targetId) => socialService.sendRequest({ userId, targetId });
    const respond = (userId, targetId, accept) => socialService.respond({ userId, targetId, accept });

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ socialService } = await import("@/services/social.service"));
        ({ chatService } = await import("@/services/chat.service"));
    });

    afterAll(async () => {
        if (!sql) return;
        // Friend rows cascade from users; conversations do not.
        const run = (text) => sql(text, [`${TAG}%`]).catch((error) => console.error("[friend test cleanup]", error));
        await run(`DELETE FROM community.conversation c WHERE EXISTS (SELECT 1 FROM community.conversation_member m JOIN identity.users u ON u.id = m.user_id WHERE m.conversation_id = c.id AND u.public_id LIKE $1)`);
        await run(`DELETE FROM identity.users WHERE public_id LIKE $1`);
    });

    it("send creates a pending row and is idempotent for the sender", async () => {
        const [a, b] = await pair();
        const first = await send(a, b);
        expect(first).toMatchObject({ friendship: "sent", user: { id: b, username: b } });
        // Same row shape as /api/users, without its cursor or privacy fields.
        expect(Object.keys(first.user).sort()).toEqual(["id", "image", "level", "levelTitle", "nickname", "username"]);
        const [before] = await rowsOf(a, b);
        expect(await send(a, b)).toMatchObject({ friendship: "sent", user: { id: b } });
        const rows = await rowsOf(a, b);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ sender: ids[a], receiver: ids[b], status: "pending", created_at: before.created_at });
    });

    it("two concurrent sends from the same user make one row", async () => {
        const [a, b] = await pair();
        const results = await Promise.all([send(a, b), send(a, b)]);
        expect(results.map((r) => r.friendship)).toEqual(["sent", "sent"]);
        expect(await rowsOf(a, b)).toMatchObject([{ status: "pending", sender: ids[a] }]);
    });

    it("A and B inviting each other become friends", async () => {
        const [a, b] = await pair();
        const results = await Promise.all([send(a, b), send(b, a)]);
        // They run one after the other: the first invites, the second accepts.
        expect(results.map((r) => r.friendship).sort()).toEqual(["friends", "sent"]);
        expect(await rowsOf(a, b)).toMatchObject([{ status: "accepted" }]);
        await expect(send(a, b)).rejects.toMatchObject({ status: 409, message: "Already friends" });
        await expect(send(b, a)).rejects.toMatchObject({ status: 409, message: "Already friends" });
    });

    it("respond: only the receiver; accept → friends, decline → rejected; 409 when not pending", async () => {
        const [a, b] = await pair();
        await send(a, b);
        await expect(respond(a, b, true)).rejects.toMatchObject({ status: 409 });
        expect(await respond(b, a, true)).toMatchObject({ friendship: "friends", user: { id: a } });
        expect(await rowsOf(a, b)).toMatchObject([{ status: "accepted" }]);
        await expect(respond(b, a, false)).rejects.toMatchObject({ status: 409 });

        const [c, d] = await pair();
        await expect(respond(d, c, true)).rejects.toMatchObject({ status: 409 });
        await send(c, d);
        expect(await respond(d, c, false)).toEqual({ friendship: null, user: expect.objectContaining({ id: c }) });
        expect(await rowsOf(c, d)).toMatchObject([{ status: "rejected", sender: ids[c] }]);
        await expect(respond(d, c, true)).rejects.toMatchObject({ status: 409 });
        await expect(respond(d, c, "yes")).rejects.toMatchObject({ status: 400 });
    });

    it("cancel: only the sender; then the receiver can no longer accept (409)", async () => {
        const [a, b] = await pair();
        await send(a, b);
        await expect(socialService.cancel({ userId: b, targetId: a })).rejects.toMatchObject({ status: 409 });
        expect(await socialService.cancel({ userId: a, targetId: b })).toEqual({ friendship: null, user: expect.objectContaining({ id: b }) });
        expect(await rowsOf(a, b)).toMatchObject([{ status: "cancelled" }]);
        await expect(respond(b, a, true)).rejects.toMatchObject({ status: 409 });
        await expect(socialService.cancel({ userId: a, targetId: b })).rejects.toMatchObject({ status: 409 });
    });

    it("resend after rejected or cancelled resets the row to pending with the new sender and a new created_at", async () => {
        const [a, b] = await pair();
        await send(a, b);
        await respond(b, a, false);
        const [rejected] = await rowsOf(a, b);
        // B now invites A: same row, sender flipped.
        expect(await send(b, a)).toMatchObject({ friendship: "sent", user: { id: a } });
        const [again] = await rowsOf(a, b);
        expect(again).toMatchObject({ sender: ids[b], receiver: ids[a], status: "pending" });
        expect(again.created_at.getTime()).toBeGreaterThan(rejected.created_at.getTime());
        expect(again.updated_at.getTime()).toBe(again.created_at.getTime());

        await socialService.cancel({ userId: b, targetId: a });
        const [cancelled] = await rowsOf(a, b);
        expect(await send(a, b)).toMatchObject({ friendship: "sent" });
        const rows = await rowsOf(a, b);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ sender: ids[a], receiver: ids[b], status: "pending" });
        expect(rows[0].created_at.getTime()).toBeGreaterThan(cancelled.created_at.getTime());
    });

    it("remove deletes the row; the direct conversation stays accepted", async () => {
        const [a, b] = await pair();
        await send(a, b);
        await respond(b, a, true);
        const { conversation } = await chatService.send({ userId: a, toUserId: b, clientId: crypto.randomUUID(), body: "hi" });
        expect(await socialService.remove({ userId: b, targetId: a })).toEqual({ friendship: null, user: expect.objectContaining({ id: a }) });
        expect(await rowsOf(a, b)).toHaveLength(0);
        const { rows } = await sql(
            `SELECT m.state FROM community.conversation_member m JOIN community.conversation c ON c.id = m.conversation_id WHERE c.public_id = $1`,
            [conversation.id]);
        expect(rows.map((r) => r.state)).toEqual(["accepted", "accepted"]);
        await expect(socialService.remove({ userId: a, targetId: b })).rejects.toMatchObject({ status: 409 });

        // A pending invitation is not a friendship.
        await send(a, b);
        await expect(socialService.remove({ userId: a, targetId: b })).rejects.toMatchObject({ status: 409 });
    });

    it("404 for missing, inactive or show_profile=false targets on send; 404 for inactive on respond/cancel/remove", async () => {
        const a = await newUser();
        const inactive = await newUser({ status: "inactive" });
        const hidden = await newUser({ showProfile: false });
        await expect(send(a, `${TAG}_missing`)).rejects.toMatchObject({ status: 404 });
        await expect(send(a, inactive)).rejects.toMatchObject({ status: 404 });
        await expect(send(a, hidden)).rejects.toMatchObject({ status: 404 });

        // A hidden profile still answers and is still answered (rule 8).
        const b = await newUser();
        await send(b, a);
        await sql(`UPDATE profile.info SET show_profile = false WHERE user_id = $1`, [ids[b]]);
        expect(await respond(a, b, true)).toMatchObject({ friendship: "friends" });

        // Rows with a user who is no longer active stay, but cannot be acted on.
        const [c, d, e] = [await newUser(), await newUser(), await newUser()];
        await send(c, a);
        await send(a, d);
        await send(a, e);
        await respond(e, a, true);
        await sql(`UPDATE identity.users SET status = 'inactive' WHERE id = ANY($1::bigint[])`, [[ids[c], ids[d], ids[e]]]);
        await expect(respond(a, c, true)).rejects.toMatchObject({ status: 404 });
        await expect(socialService.cancel({ userId: a, targetId: d })).rejects.toMatchObject({ status: 404 });
        await expect(socialService.remove({ userId: a, targetId: e })).rejects.toMatchObject({ status: 404 });
        expect(await rowsOf(a, c)).toMatchObject([{ status: "pending" }]);
        expect(await rowsOf(a, d)).toMatchObject([{ status: "pending" }]);
        expect(await rowsOf(a, e)).toMatchObject([{ status: "accepted" }]);
    });

    it("403 Can't send a friend request when either side blocked", async () => {
        const [a, b] = await pair();
        await sql(`INSERT INTO community.user_block (blocker_id, blocked_id) VALUES ($1, $2)`, [ids[b], ids[a]]);
        await expect(send(a, b)).rejects.toMatchObject({ status: 403, message: "Can't send a friend request" });
        await expect(send(b, a)).rejects.toMatchObject({ status: 403, message: "Can't send a friend request" });
        expect(await rowsOf(a, b)).toHaveLength(0);
    });

    it("409 Already friends", async () => {
        const [a, b] = await pair();
        await send(a, b);
        await respond(b, a, true);
        await expect(send(a, b)).rejects.toMatchObject({ status: 409, message: "Already friends" });
    });

    const statesOf = async (conversationId) => (await sql(
        `SELECT u.public_id, m.state FROM community.conversation_member m
         JOIN community.conversation c ON c.id = m.conversation_id JOIN identity.users u ON u.id = m.user_id
         WHERE c.public_id = $1`, [conversationId])).rows.reduce((acc, r) => ({ ...acc, [r.public_id]: r.state }), {});
    const chat = async (from, to) => (await chatService.send({ userId: from, toUserId: to, clientId: crypto.randomUUID(), body: "hi" })).conversation.id;

    it("blocking removes the friendship in any state", async () => {
        for (const make of [
            async (a, b) => send(a, b),
            async (a, b) => { await send(a, b); await respond(b, a, true); },
            async (a, b) => { await send(a, b); await respond(b, a, false); },
        ]) {
            const [a, b] = await pair();
            await make(a, b);
            expect(await rowsOf(a, b)).toHaveLength(1);
            expect(await chatService.block({ userId: b, targetId: a })).toEqual({ blocked: true });
            expect(await rowsOf(a, b)).toHaveLength(0);
        }
    });

    it("after a block the pending invitation is gone from both sides", async () => {
        const [a, b] = await pair();
        await send(a, b);
        await chatService.block({ userId: a, targetId: b });
        await expect(respond(b, a, true)).rejects.toMatchObject({ status: 409 });
        await expect(socialService.cancel({ userId: a, targetId: b })).rejects.toMatchObject({ status: 409 });
        // Unblocking does not bring it back (rule 5).
        await chatService.unblock({ userId: a, targetId: b });
        expect(await rowsOf(a, b)).toHaveLength(0);
        await expect(respond(b, a, true)).rejects.toMatchObject({ status: 409 });
    });

    it("becoming friends turns a pending or declined direct conversation into accepted", async () => {
        // Pending: A wrote to B, then B accepts A's invitation.
        const [a, b] = await pair();
        const first = await chat(a, b);
        expect(await statesOf(first)).toEqual({ [a]: "accepted", [b]: "pending" });
        await send(a, b);
        expect(await statesOf(first)).toEqual({ [a]: "accepted", [b]: "pending" });
        await respond(b, a, true);
        expect(await statesOf(first)).toEqual({ [a]: "accepted", [b]: "accepted" });

        // Declined: D declined C's message, then their invitations cross (rule 1, "B already invited").
        const [c, d] = await pair();
        const second = await chat(c, d);
        await chatService.respondRequest({ userId: d, conversationId: second, accept: false });
        expect(await statesOf(second)).toEqual({ [c]: "accepted", [d]: "declined" });
        await send(c, d);
        expect(await send(d, c)).toMatchObject({ friendship: "friends" });
        expect(await statesOf(second)).toEqual({ [c]: "accepted", [d]: "accepted" });
    });

    // Reads. Rows go straight into the table; `ago` (seconds) orders invitations by updated_at.
    const link = (sender, receiver, status, ago = 0) => sql(
        `INSERT INTO community.friend (sender_id, receiver_id, status, updated_at) VALUES ($1, $2, $3, now() - make_interval(secs => $4))`,
        [ids[sender], ids[receiver], status, ago]);
    // The row for `target` in the viewer's people search, or undefined. Usernames share the tag, so the page is wide.
    const findPerson = async (viewer, target) => (await socialService.searchUsers({ userId: viewer, search: target, limit: 200 }))
        .items.find((u) => u.id === target);
    const idsOf = (page) => page.items.map((u) => u.id);
    const allFriends = async (userId) => idsOf(await socialService.listFriends({ userId }));
    const allInvitations = async (userId, direction) => idsOf(await socialService.listInvitations({ userId, direction }));

    it("/api/users keeps invited people and returns their friendship", async () => {
        const [v, sent, received, friend, none, rejected] = [await newUser(), await newUser(), await newUser(), await newUser(), await newUser(), await newUser()];
        await link(v, sent, "pending");
        await link(received, v, "pending");
        await link(friend, v, "accepted");
        await link(v, rejected, "rejected");
        expect(await findPerson(v, sent)).toMatchObject({ friendship: "sent" });
        expect(await findPerson(v, received)).toMatchObject({ friendship: "received" });
        expect(await findPerson(v, friend)).toMatchObject({ friendship: "friends" });
        expect(await findPerson(v, none)).toMatchObject({ friendship: null });
        expect(await findPerson(v, rejected)).toMatchObject({ friendship: null });
        // Seen from the other side.
        expect(await findPerson(sent, v)).toMatchObject({ friendship: "received" });
    });

    it("/api/users hides people with a block in either direction", async () => {
        const [v, blocked, blocker] = [await newUser(), await newUser(), await newUser()];
        await sql(`INSERT INTO community.user_block (blocker_id, blocked_id) VALUES ($1, $2), ($3, $1)`, [ids[v], ids[blocked], ids[blocker]]);
        expect(await findPerson(v, blocked)).toBeUndefined();
        expect(await findPerson(v, blocker)).toBeUndefined();
        expect(await findPerson(blocked, v)).toBeUndefined();
        expect(await findPerson(blocker, v)).toBeUndefined();
        expect(await findPerson(blocked, blocker)).toMatchObject({ friendship: null });
    });

    it("a friend who turns show_profile off stays in Friends but leaves Find people", async () => {
        const [v, friend] = await pair();
        await link(v, friend, "accepted");
        await sql(`UPDATE profile.info SET show_profile = false WHERE user_id = $1`, [ids[friend]]);
        expect(await findPerson(v, friend)).toBeUndefined();
        expect(await allFriends(v)).toEqual([friend]);
        expect(await allFriends(friend)).toEqual([v]);
    });

    it("inactive users leave Friends and Invitations", async () => {
        const [v, friend, received, sent] = [await newUser(), await newUser(), await newUser(), await newUser()];
        await link(v, friend, "accepted");
        await link(received, v, "pending");
        await link(v, sent, "pending");
        expect(await allFriends(v)).toEqual([friend]);
        expect(await socialService.counts({ userId: v })).toEqual({ friends: 1, received: 1 });
        await sql(`UPDATE identity.users SET status = 'inactive' WHERE id = ANY($1::bigint[])`, [[ids[friend], ids[received], ids[sent]]]);
        expect(await allFriends(v)).toEqual([]);
        expect(await allInvitations(v, "received")).toEqual([]);
        expect(await allInvitations(v, "sent")).toEqual([]);
        expect(await socialService.counts({ userId: v })).toEqual({ friends: 0, received: 0 });
    });

    it("listFriends pages by (username, id) without gaps or repeats", async () => {
        const v = await newUser();
        const friends = [];
        for (let i = 0; i < 25; i++) {
            const f = await newUser();
            friends.push(f);
            // Both directions of the edge.
            await (i % 2 ? link(v, f, "accepted") : link(f, v, "accepted"));
        }
        await link(v, await newUser(), "pending");
        const first = await socialService.listFriends({ userId: v });
        expect(first.items).toHaveLength(20);
        expect(Object.keys(first.items[0]).sort()).toEqual(["id", "image", "level", "levelTitle", "nickname", "username"]);
        const second = await socialService.listFriends({ userId: v, cursor: first.nextCursor });
        expect(second.items).toHaveLength(5);
        expect(second.nextCursor).toBeNull();
        expect([...idsOf(first), ...idsOf(second)]).toEqual([...friends].sort());
        await expect(socialService.listFriends({ userId: v, cursor: "not-a-cursor" })).rejects.toMatchObject({ status: 400 });
    });

    it("listFriends search filters by username", async () => {
        const [v, a, b] = [await newUser(), await newUser(), await newUser()];
        await link(v, a, "accepted");
        await link(b, v, "accepted");
        expect(idsOf(await socialService.listFriends({ userId: v, search: b }))).toEqual([b]);
        expect(idsOf(await socialService.listFriends({ userId: v, search: b.toUpperCase() }))).toEqual([b]);
        expect(idsOf(await socialService.listFriends({ userId: v, search: "%" }))).toEqual([]);
        expect(idsOf(await socialService.listFriends({ userId: v, search: "  " }))).toEqual([a, b].sort());
    });

    it("listInvitations returns received and sent separately, newest first, paged", async () => {
        const v = await newUser();
        const [r1, r2, r3, s1, s2, f] = [await newUser(), await newUser(), await newUser(), await newUser(), await newUser(), await newUser()];
        await link(r1, v, "pending", 30);
        await link(r2, v, "pending", 10);
        await link(r3, v, "pending", 20);
        await link(v, s1, "pending", 5);
        await link(v, s2, "pending", 1);
        await link(v, f, "accepted");
        const first = await socialService.listInvitations({ userId: v, direction: "received", limit: 2 });
        expect(idsOf(first)).toEqual([r2, r3]);
        expect(Object.keys(first.items[0]).sort()).toEqual(["id", "image", "level", "levelTitle", "nickname", "username"]);
        const second = await socialService.listInvitations({ userId: v, direction: "received", limit: 2, cursor: first.nextCursor });
        expect(idsOf(second)).toEqual([r1]);
        expect(second.nextCursor).toBeNull();
        expect(await allInvitations(v, "sent")).toEqual([s2, s1]);
        expect(await allInvitations(r1, "sent")).toEqual([v]);
        await expect(socialService.listInvitations({ userId: v, direction: "received", cursor: "not-a-cursor" }))
            .rejects.toMatchObject({ status: 400 });
    });

    it("counts returns friends and received pending", async () => {
        const v = await newUser();
        const others = [];
        for (let i = 0; i < 7; i++) others.push(await newUser());
        await link(v, others[0], "accepted");
        await link(others[1], v, "accepted");
        await link(others[2], v, "pending");
        await link(others[3], v, "pending");
        await link(others[4], v, "pending");
        await link(v, others[5], "pending");
        await link(others[6], v, "rejected");
        expect(await socialService.counts({ userId: v })).toEqual({ friends: 2, received: 3 });
        expect(await socialService.counts({ userId: others[5] })).toEqual({ friends: 0, received: 1 });
    });

    it("400 for a malformed id or yourself", async () => {
        const a = await newUser();
        for (const targetId of ["", "x".repeat(65), 42, null, undefined]) {
            await expect(send(a, targetId)).rejects.toMatchObject({ status: 400 });
        }
        await expect(send(a, a)).rejects.toMatchObject({ status: 400 });
        await expect(respond(a, a, true)).rejects.toMatchObject({ status: 400 });
        await expect(socialService.cancel({ userId: a, targetId: a })).rejects.toMatchObject({ status: 400 });
        await expect(socialService.remove({ userId: a, targetId: a })).rejects.toMatchObject({ status: 400 });
    });
});
