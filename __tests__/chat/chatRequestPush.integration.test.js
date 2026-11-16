// markRequestPushed against real PostgreSQL: one claim per (conversation, recipient), none after decline or block.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chatMedia", () => ({ remove: vi.fn(async () => { }) }));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request scope"); } }));

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `rp${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("chat request push claim (PostgreSQL)", () => {
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
    const stranger = async () => {
        const [a, b] = [await newUser(), await newUser()];
        const sent = await chatService.send({ userId: a, toUserId: b, clientId: crypto.randomUUID(), body: "hi" });
        return { a, b, conversationId: sent.conversation.id };
    };
    const claim = (b, conversationId) => chatService.markRequestPushed({ userId: b, conversationId });

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

    it("three messages from a stranger push once", async () => {
        const { b, conversationId } = await stranger();
        expect([await claim(b, conversationId), await claim(b, conversationId), await claim(b, conversationId)]).toEqual([true, false, false]);
    });

    it("no push when the recipient declined", async () => {
        const { b, conversationId } = await stranger();
        await chatService.respondRequest({ userId: b, conversationId, accept: false });
        expect(await claim(b, conversationId)).toBe(false);
    });

    it("no push when the recipient blocked the sender", async () => {
        const { a, b, conversationId } = await stranger();
        await sql(`INSERT INTO community.user_block (blocker_id, blocked_id) VALUES ($1, $2)`, [ids[b], ids[a]]);
        expect(await claim(b, conversationId)).toBe(false);
    });

    it("no push once the request was accepted", async () => {
        const { b, conversationId } = await stranger();
        await chatService.respondRequest({ userId: b, conversationId, accept: true });
        expect(await claim(b, conversationId)).toBe(false);
    });
});
