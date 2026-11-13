// Notifications and realtime events after friend writes, against real PostgreSQL; only the delivery boundaries are mocked.
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
const TAG = `fs${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("friend side effects", () => {
    let sql, socialService, chatService, n = 0;
    const ids = {};
    const newUser = async () => {
        const publicId = `${TAG}_${n++}`;
        const id = String(975000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified, status) VALUES ($1, $2, $2, $3, true, 'active')`, [id, publicId, `${publicId}@test.invalid`]);
        await sql(`INSERT INTO profile.info (user_id, surname, name, show_profile) VALUES ($1, 'T', 'T', true)`, [id]);
        ids[publicId] = id;
        return publicId;
    };
    const pair = async () => [await newUser(), await newUser()];
    const createdAtMs = async (a, b) => (await sql(
        `SELECT created_at FROM community.friend
         WHERE LEAST(sender_id, receiver_id) = LEAST($1::bigint, $2::bigint) AND GREATEST(sender_id, receiver_id) = GREATEST($1::bigint, $2::bigint)`,
        [ids[a], ids[b]])).rows[0].created_at.getTime();
    const send = (userId, targetId) => socialService.sendRequest({ userId, targetId });
    const respond = (userId, targetId, accept) => socialService.respond({ userId, targetId, accept });
    const friendEvents = () => publishToUser.mock.calls.filter(([, event]) => event === "friend-updated").map(([to, , data]) => ({ to, ...data }));

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ socialService } = await import("@/services/social.service"));
        ({ chatService } = await import("@/services/chat.service"));
    });

    beforeEach(() => {
        notify.mockClear();
        publishToUser.mockReset();
        publishToUser.mockResolvedValue(true);
        publish.mockClear();
    });

    afterAll(async () => {
        if (!sql) return;
        const run = (text) => sql(text, [`${TAG}%`]).catch((error) => console.error("[friend test cleanup]", error));
        await run(`DELETE FROM community.conversation c WHERE EXISTS (SELECT 1 FROM community.conversation_member m JOIN identity.users u ON u.id = m.user_id WHERE m.conversation_id = c.id AND u.public_id LIKE $1)`);
        await run(`DELETE FROM identity.users WHERE public_id LIKE $1`);
    });

    it("send notifies the receiver once per request", async () => {
        const [a, b] = await pair();
        await send(a, b);
        await send(a, b); // idempotent: same request, no second notification
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith(b, expect.objectContaining({
            kind: "friend_request", link: "/contact?tab=invitations", dedupeKey: `${a}:${await createdAtMs(a, b)}`,
        }));
    });

    it("a resend after a decline is a new request and notifies again", async () => {
        const [a, b] = await pair();
        await send(a, b);
        const firstKey = notify.mock.calls[0][1].dedupeKey;
        await respond(b, a, false);
        await new Promise((r) => setTimeout(r, 5)); // created_at must move on
        await send(a, b);
        expect(notify).toHaveBeenCalledTimes(2);
        const secondKey = notify.mock.calls[1][1].dedupeKey;
        expect(secondKey).toBe(`${a}:${await createdAtMs(a, b)}`);
        expect(secondKey).not.toBe(firstKey);
    });

    it("accept notifies the original sender", async () => {
        const [a, b] = await pair();
        await send(a, b);
        notify.mockClear();
        await respond(b, a, true);
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith(a, expect.objectContaining({
            kind: "friend_accepted", link: "/contact?tab=friends", dedupeKey: `${b}:${await createdAtMs(a, b)}`,
        }));

        // A send that crosses the other person's invitation accepts it, and notifies its sender.
        const [c, d] = await pair();
        await send(c, d);
        notify.mockClear();
        await send(d, c);
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith(c, expect.objectContaining({ kind: "friend_accepted", dedupeKey: `${d}:${await createdAtMs(c, d)}` }));
    });

    it("decline, cancel and remove notify nobody", async () => {
        const [a, b] = await pair();
        await send(a, b);
        notify.mockClear();
        await respond(b, a, false);
        expect(notify).not.toHaveBeenCalled();
        await send(b, a);
        notify.mockClear();
        await socialService.cancel({ userId: b, targetId: a });
        expect(notify).not.toHaveBeenCalled();
        await send(a, b);
        await respond(b, a, true);
        notify.mockClear();
        await socialService.remove({ userId: a, targetId: b });
        await chatService.block({ userId: a, targetId: b });
        expect(notify).not.toHaveBeenCalled();
    });

    it("each change publishes friend-updated to both users with their own friendship and previous", async () => {
        const [a, b] = await pair();
        const userOf = (id) => expect.objectContaining({ id, username: id });

        await send(a, b);
        expect(friendEvents()).toEqual([
            { to: a, user: userOf(b), friendship: "sent", previous: null },
            { to: b, user: userOf(a), friendship: "received", previous: null },
        ]);
        publishToUser.mockClear();
        await send(a, b); // nothing changed, nothing published
        expect(friendEvents()).toEqual([]);

        await respond(b, a, true);
        expect(friendEvents()).toEqual([
            { to: b, user: userOf(a), friendship: "friends", previous: "received" },
            { to: a, user: userOf(b), friendship: "friends", previous: "sent" },
        ]);
        publishToUser.mockClear();
        await socialService.remove({ userId: a, targetId: b });
        expect(friendEvents()).toEqual([
            { to: a, user: userOf(b), friendship: null, previous: "friends" },
            { to: b, user: userOf(a), friendship: null, previous: "friends" },
        ]);

        publishToUser.mockClear();
        await send(b, a);
        publishToUser.mockClear();
        await chatService.block({ userId: a, targetId: b });
        expect(friendEvents()).toEqual([
            { to: a, user: userOf(b), friendship: null, previous: "received" },
            { to: b, user: userOf(a), friendship: null, previous: "sent" },
        ]);
        publishToUser.mockClear();
        await chatService.block({ userId: a, targetId: b }); // no row left: no event
        expect(friendEvents()).toEqual([]);
    });

    it("accepting a pending direct conversation tells that member", async () => {
        const [a, b] = await pair();
        const { conversation } = await chatService.send({ userId: a, toUserId: b, clientId: crypto.randomUUID(), body: "hi" });
        await send(a, b);
        publish.mockClear();
        await respond(b, a, true);
        expect(publish).toHaveBeenCalledWith([`private-user-${b}`], "chat-conversation-updated", { conversationId: conversation.id }, expect.anything());
    });

    it("a realtime failure is logged and the result is unchanged", async () => {
        const [a, b] = await pair();
        const error = vi.spyOn(console, "error").mockImplementation(() => { });
        publishToUser.mockRejectedValue(new Error("pusher down"));
        try {
            expect(await send(a, b)).toMatchObject({ friendship: "sent", user: { id: b } });
            expect(error).toHaveBeenCalled();
            // The notification is not lost because the event failed.
            expect(notify).toHaveBeenCalledTimes(1);
        } finally {
            error.mockRestore();
        }
    });
});
