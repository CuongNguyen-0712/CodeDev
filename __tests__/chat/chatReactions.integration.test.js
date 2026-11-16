// Message reactions against real PostgreSQL; test users and conversations are deleted afterwards.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chatMedia", () => ({ remove: vi.fn(async () => { }) }));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request scope"); } }));

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `rx${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
const uuid = () => crypto.randomUUID();
const EMOJI = ["👍", "❤️", "😂", "😮", "😢", "😡", "🎉", "🔥", "🙏", "👀", "💯", "✅", "⭐", "🚀", "🍕", "🐱", "🌈", "⚽", "🎵", "📚", "🧠"];

describe.skipIf(!hasDb)("chat reactions (PostgreSQL)", () => {
    let sql, chatService, n = 0;
    const ids = {};
    const newUser = async () => {
        const publicId = `${TAG}_${n++}`;
        const id = String(976000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, true)`, [id, publicId, `${publicId}@test.invalid`]);
        await sql(`INSERT INTO profile.info (user_id, surname, name, show_profile) VALUES ($1, 'T', 'T', true)`, [id]);
        ids[publicId] = id;
        return publicId;
    };
    // Two friends with one message from the first.
    const setup = async () => {
        const [a, b] = [await newUser(), await newUser()];
        await sql(`INSERT INTO community.friend (sender_id, receiver_id, status) VALUES ($1, $2, 'accepted')`, [ids[a], ids[b]]);
        const sent = await chatService.send({ userId: a, toUserId: b, clientId: uuid(), body: "hi" });
        return { a, b, messageId: sent.message.id, conversationId: sent.conversation.id };
    };
    const toggle = (userId, messageId, emoji) => chatService.toggleReaction({ userId, messageId, emoji });
    const rowCount = async (messageId) => (await sql(
        `SELECT count(*)::int AS n FROM community.chat_reaction r JOIN community.chat_message m ON m.id = r.message_id WHERE m.public_id = $1`, [messageId])).rows[0].n;

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ chatService } = await import("@/services/chat.service"));
    });

    afterAll(async () => {
        if (!sql) return;
        const run = (text) => sql(text, [`${TAG}%`]).catch((error) => console.error("[chat test cleanup]", error));
        await run(`DELETE FROM community.conversation c WHERE EXISTS (SELECT 1 FROM community.conversation_member m JOIN identity.users u ON u.id = m.user_id WHERE m.conversation_id = c.id AND u.public_id LIKE $1)`);
        await run(`DELETE FROM identity.users WHERE public_id LIKE $1`);
    });

    it("toggle adds then removes", async () => {
        const { a, b, messageId } = await setup();
        expect(await toggle(b, messageId, "👍")).toMatchObject({ added: true, reactions: [{ emoji: "👍", count: 1, userIds: [b] }] });
        expect(await toggle(a, messageId, "👍")).toMatchObject({ added: true, reactions: [{ emoji: "👍", count: 2 }] });
        expect(await toggle(b, messageId, "👍")).toMatchObject({ added: false, reactions: [{ emoji: "👍", count: 1, userIds: [a] }] });
        expect((await toggle(a, messageId, "👍")).reactions).toEqual([]);
    });

    it("two concurrent toggles of the same emoji end consistent with no error", async () => {
        const { b, messageId } = await setup();
        const results = await Promise.all([toggle(b, messageId, "🔥"), toggle(b, messageId, "🔥")]);
        expect(results.map((r) => r.added).sort()).toEqual([false, true]);
        expect(await rowCount(messageId)).toBe(0);
    });

    it("a 21st different emoji by the same user is 422", async () => {
        const { b, messageId } = await setup();
        for (const emoji of EMOJI.slice(0, 20)) await toggle(b, messageId, emoji);
        await expect(toggle(b, messageId, EMOJI[20])).rejects.toMatchObject({ status: 422 });
        // Removing one still works at the cap, and frees a slot.
        expect((await toggle(b, messageId, EMOJI[0])).added).toBe(false);
        expect((await toggle(b, messageId, EMOJI[20])).added).toBe(true);
    });

    it("pending, declined and non-members get 403/404", async () => {
        const [a, b, c] = [await newUser(), await newUser(), await newUser()];
        const sent = await chatService.send({ userId: a, toUserId: b, clientId: uuid(), body: "hello stranger" });
        const { id: messageId } = sent.message;
        await expect(toggle(b, messageId, "👍")).rejects.toMatchObject({ status: 403 });
        await chatService.respondRequest({ userId: b, conversationId: sent.conversation.id, accept: false });
        await expect(toggle(b, messageId, "👍")).rejects.toMatchObject({ status: 403 });
        await expect(toggle(c, messageId, "👍")).rejects.toMatchObject({ status: 404 });
        await expect(toggle(a, `msg_${"0".repeat(26)}`, "👍")).rejects.toMatchObject({ status: 404 });
        await expect(toggle(a, messageId, "👍👍")).rejects.toMatchObject({ status: 422 });
    });

    it("an unsent message is 409 and unsending clears its reactions", async () => {
        const { a, b, messageId } = await setup();
        await toggle(b, messageId, "👍");
        const { message } = await chatService.recallMessage({ userId: a, messageId });
        expect(message.reactions).toEqual([]);
        expect(await rowCount(messageId)).toBe(0);
        await expect(toggle(b, messageId, "👍")).rejects.toMatchObject({ status: 409 });
    });

    it("reactions in the DTO keep first-reaction order with userIds", async () => {
        const { a, b, messageId, conversationId } = await setup();
        await toggle(b, messageId, "😂");
        await toggle(a, messageId, "👍");
        await toggle(a, messageId, "😂");
        const expected = [{ emoji: "😂", count: 2, userIds: [b, a] }, { emoji: "👍", count: 1, userIds: [a] }];
        const listed = await chatService.listMessages({ userId: a, conversationId });
        expect(listed.items.find((m) => m.id === messageId).reactions).toEqual(expected);
    });
});
