// Chat service rules (open, send, read) against real PostgreSQL; test users, their teams and conversations are deleted afterwards.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `cv${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
const uuid = () => crypto.randomUUID();

describe.skipIf(!hasDb)("chat service (PostgreSQL)", () => {
    let sql, chatService, n = 0;
    const ids = {};
    const newUser = async () => {
        const publicId = `${TAG}_${n++}`;
        const id = String(975000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, true)`, [id, publicId, `${publicId}@test.invalid`]);
        await sql(`INSERT INTO profile.info (user_id, surname, name, show_profile) VALUES ($1, 'T', 'T', true)`, [id]);
        ids[publicId] = id;
        return publicId;
    };
    const pair = async () => [await newUser(), await newUser()];
    const befriend = (a, b) => sql(`INSERT INTO community.friend (sender_id, receiver_id, status) VALUES ($1, $2, 'accepted')`, [ids[a], ids[b]]);
    const send = (userId, to, body = "hi", extra = {}) => chatService.send({ userId, ...(to.startsWith("cnv_") ? { conversationId: to } : { toUserId: to }), clientId: uuid(), body, ...extra });

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ chatService } = await import("@/services/chat.service"));
    });

    afterAll(async () => {
        if (!sql) return;
        // Each delete runs even if the one before it failed; conversations do not cascade from users.
        const run = (text) => sql(text, [`${TAG}%`]).catch((error) => console.error("[chat test cleanup]", error));
        await run(`DELETE FROM community.conversation c WHERE EXISTS (SELECT 1 FROM community.conversation_member m JOIN identity.users u ON u.id = m.user_id WHERE m.conversation_id = c.id AND u.public_id LIKE $1)`);
        await run(`DELETE FROM identity.users WHERE public_id LIKE $1`);
    });

    it("first message to a stranger lands in their requests", async () => {
        const [a, b] = await pair();
        const r = await chatService.send({ userId: a, toUserId: b, clientId: uuid(), body: "hi" });
        expect(r.created).toBe(true);
        expect(r.conversation).toMatchObject({ id: expect.stringMatching(/^cnv_[0-9a-z]{26}$/), kind: "direct" });
        expect(r.message).toMatchObject({ id: expect.stringMatching(/^msg_[0-9a-z]{26}$/), body: "hi", deleted: false, attachments: [], sender: { id: a, username: a, nickname: null } });
        expect(r.recipients).toEqual([{ publicId: b, state: "pending" }]);
        expect((await chatService.listConversations({ userId: b, tab: "requests" })).items[0]).toMatchObject({ id: r.conversation.id, state: "pending", title: a, lastMessage: { seq: r.message.seq, preview: "hi", senderId: a } });
        expect((await chatService.listConversations({ userId: b, tab: "all" })).items).toHaveLength(0);
        expect((await chatService.listConversations({ userId: a, tab: "all" })).items[0]).toMatchObject({ id: r.conversation.id, state: "accepted", unread: false });
        expect(await chatService.unreadCounts({ userId: b })).toEqual({ unread: 0, requests: 1 });
    });

    it("a second message while the recipient is pending is refused", async () => {
        const [a, b] = await pair();
        const r = await send(a, b);
        await expect(send(a, b)).rejects.toMatchObject({ status: 403, message: "You can't send messages in this conversation" });
        await expect(send(a, r.conversation.id)).rejects.toMatchObject({ status: 403 });
        expect(await chatService.getConversation({ userId: a, conversationId: r.conversation.id })).toMatchObject({ canSend: false, state: "accepted" });
    });

    it("friends and team mates skip the request", async () => {
        const [a, b] = await pair();
        await befriend(a, b);
        expect((await send(a, b)).recipients).toEqual([{ publicId: b, state: "accepted" }]);

        const c = await newUser();
        const team = `${TAG}t`;
        await sql(`INSERT INTO community.team (id, name, size, host_id) VALUES ($1, 'Chat test', 2, $2)`, [team, ids[a]]);
        await sql(`INSERT INTO community.team_members (team_id, user_id, status) VALUES ($1, $2, 'approved'), ($1, $3, 'approved')`, [team, ids[a], ids[c]]);
        const r = await send(c, a);
        expect(r.recipients).toEqual([{ publicId: a, state: "accepted" }]);
        expect((await send(c, r.conversation.id)).created).toBe(true);
    });

    it("the same clientId twice yields one row and created=false", async () => {
        const [a, b] = await pair();
        const clientId = uuid();
        const first = await chatService.send({ userId: a, toUserId: b, clientId, body: "once" });
        const again = await chatService.send({ userId: a, toUserId: b, clientId, body: "once" });
        expect(again.created).toBe(false);
        expect(again.message.id).toBe(first.message.id);
        const { rows } = await sql(`SELECT count(*)::int AS n FROM community.chat_message WHERE client_id = $1`, [clientId]);
        expect(rows[0].n).toBe(1);
    });

    it("calls afterSend after commit only for new messages, and a throwing hook does not fail send", async () => {
        const [a, b] = await pair();
        await befriend(a, b);
        const calls = [];
        const original = chatService.afterSend;
        chatService.afterSend = async (result, opts) => { calls.push([result.message.id, opts]); throw new Error("hook down"); };
        try {
            const clientId = uuid();
            const r = await chatService.send({ userId: a, toUserId: b, clientId, body: "x", socketId: "s1" });
            await chatService.send({ userId: a, toUserId: b, clientId, body: "x", socketId: "s1" });
            expect(calls).toEqual([[r.message.id, { socketId: "s1" }]]);
        } finally {
            chatService.afterSend = original;
        }
    });

    it("blocks work both ways", async () => {
        const [a, b] = await pair();
        await sql(`INSERT INTO community.user_block (blocker_id, blocked_id) VALUES ($1, $2)`, [ids[a], ids[b]]);
        await expect(send(a, b)).rejects.toMatchObject({ status: 403 });
        await expect(send(b, a)).rejects.toMatchObject({ status: 403 });
    });

    it("a hidden or inactive recipient is not found", async () => {
        const [a, hidden, inactive] = [await newUser(), await newUser(), await newUser()];
        await sql(`UPDATE profile.info SET show_profile = false WHERE user_id = $1`, [ids[hidden]]);
        await sql(`UPDATE identity.users SET status = 'inactive' WHERE id = $1`, [ids[inactive]]);
        await expect(send(a, hidden)).rejects.toMatchObject({ status: 404 });
        await expect(send(a, inactive)).rejects.toMatchObject({ status: 404 });
        await expect(send(a, `${TAG}_nobody`)).rejects.toMatchObject({ status: 404 });
        await expect(send(a, a)).rejects.toMatchObject({ status: 404 });
    });

    it("an existing conversation with a deactivated recipient refuses new messages but keeps history", async () => {
        const [a, b] = await pair();
        await befriend(a, b);
        const r = await send(a, b, "before");
        await sql(`UPDATE identity.users SET status = 'blocked' WHERE id = $1`, [ids[b]]);
        await expect(send(a, r.conversation.id)).rejects.toMatchObject({ status: 403 });
        await expect(send(a, b)).rejects.toMatchObject({ status: 403 });
        expect((await chatService.listMessages({ userId: a, conversationId: r.conversation.id })).items.map((m) => m.body)).toEqual(["before"]);
    });

    it("the pending recipient replying accepts the conversation", async () => {
        const [a, b] = await pair();
        const r = await send(a, b);
        const reply = await send(b, r.conversation.id, "hey");
        expect(reply.recipients).toEqual([{ publicId: a, state: "accepted" }]);
        expect((await chatService.listConversations({ userId: b, tab: "all" })).items[0]).toMatchObject({ id: r.conversation.id, state: "accepted" });
        expect((await chatService.listConversations({ userId: b, tab: "requests" })).items).toHaveLength(0);
        expect((await send(a, r.conversation.id, "again")).created).toBe(true);
        const detail = await chatService.getConversation({ userId: b, conversationId: r.conversation.id });
        expect(detail).toMatchObject({ kind: "direct", title: a, state: "accepted", canSend: true });
        expect(detail.members.find((m) => m.id === b).lastReadSeq).toBe(reply.message.seq);
    });

    it("a declined request looks pending to the sender", async () => {
        const [a, b] = await pair();
        const conversationId = (await send(a, b)).conversation.id;
        await sql(`UPDATE community.conversation_member SET state = 'declined' WHERE user_id = $1`, [ids[b]]);
        const seen = await chatService.getConversation({ userId: a, conversationId });
        expect(seen.canSend).toBe(false);
        expect(seen.members.find((m) => m.id === b).state).toBe("pending");
        const own = await chatService.getConversation({ userId: b, conversationId });
        expect(own.state).toBe("declined");
        expect(own.members.find((m) => m.id === b).state).toBe("declined");
    });

    it("unread counts conversations, not messages", async () => {
        const [a, b] = await pair();
        const r = await send(a, b);
        await send(b, r.conversation.id, "ok");
        for (const body of ["1", "2", "3"]) await send(a, r.conversation.id, body);
        expect(await chatService.unreadCounts({ userId: b })).toEqual({ unread: 1, requests: 0 });
        expect(await chatService.unreadCounts({ userId: a })).toEqual({ unread: 0, requests: 0 });
        expect((await chatService.listConversations({ userId: b, tab: "all" })).items[0]).toMatchObject({ unread: true, lastMessage: { preview: "3" } });
    });

    it("pages messages with before=seq", async () => {
        const [a, b] = await pair();
        await befriend(a, b);
        const conversationId = (await send(a, b, "m0")).conversation.id;
        for (let i = 1; i < 35; i++) await send(a, conversationId, `m${i}`);
        const first = await chatService.listMessages({ userId: b, conversationId });
        expect(first.items).toHaveLength(30);
        expect(first.items[0].body).toBe("m34");
        expect(first.nextCursor).toBe(first.items[29].seq);
        const second = await chatService.listMessages({ userId: b, conversationId, before: first.nextCursor });
        expect(second.items.map((m) => m.body)).toEqual(["m4", "m3", "m2", "m1", "m0"]);
        expect(second.nextCursor).toBeNull();
        await expect(chatService.listMessages({ userId: b, conversationId, before: "x1" })).rejects.toMatchObject({ status: 400 });
    });

    it("keeps the body as sent and previews code, long text and limits", async () => {
        const [a, b] = await pair();
        await befriend(a, b);
        const body = "  indented\n    code";
        const r = await send(a, b, body);
        expect(r.message.body).toBe(body);
        await send(a, r.conversation.id, "see ```js\nx()\n```");
        expect((await chatService.listConversations({ userId: b, tab: "all" })).items[0].lastMessage.preview).toBe("[code]");
        await send(a, r.conversation.id, "y".repeat(100));
        expect((await chatService.listConversations({ userId: b, tab: "all" })).items[0].lastMessage.preview).toBe("y".repeat(80));
        await expect(send(a, r.conversation.id, "   ")).rejects.toMatchObject({ status: 422 });
        await expect(send(a, r.conversation.id, "z".repeat(4001))).rejects.toMatchObject({ status: 422 });
        expect((await send(a, r.conversation.id, "z".repeat(4000))).created).toBe(true);
    });

    it("pages the inbox by last message", async () => {
        const a = await newUser();
        const others = [];
        for (let i = 0; i < 22; i++) {
            const o = await newUser();
            await befriend(a, o);
            others.push((await send(o, a, `from ${i}`)).conversation.id);
        }
        const first = await chatService.listConversations({ userId: a, tab: "all" });
        expect(first.items).toHaveLength(20);
        expect(first.items[0].id).toBe(others[21]);
        const second = await chatService.listConversations({ userId: a, tab: "all", cursor: first.nextCursor });
        expect(second.items.map((c) => c.id)).toEqual([others[1], others[0]]);
        expect(second.nextCursor).toBeNull();
    });

    it("a non member gets 404 everywhere", async () => {
        const [a, b] = await pair();
        const outsider = await newUser();
        const r = await send(a, b);
        const conversationId = r.conversation.id;
        await expect(chatService.getConversation({ userId: outsider, conversationId })).rejects.toMatchObject({ status: 404 });
        await expect(chatService.listMessages({ userId: outsider, conversationId })).rejects.toMatchObject({ status: 404 });
        await expect(chatService.getMessage({ userId: outsider, messageId: r.message.id })).rejects.toMatchObject({ status: 404 });
        await expect(send(outsider, conversationId)).rejects.toMatchObject({ status: 404 });
        await expect(chatService.getConversation({ userId: outsider, conversationId: "cnv_bad" })).rejects.toMatchObject({ status: 400 });
        await expect(chatService.getMessage({ userId: outsider, messageId: "nope" })).rejects.toMatchObject({ status: 400 });
        expect(await chatService.getMessage({ userId: b, messageId: r.message.id })).toMatchObject({ id: r.message.id, conversationId });
    });
});
