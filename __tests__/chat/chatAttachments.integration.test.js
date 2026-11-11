// Chat image attachments (upload, send, read URL, orphan purge) against real PostgreSQL; storage is mocked.
import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chatMedia", async () => ({
    chatMediaKey: (await vi.importActual("@/lib/chatMedia")).chatMediaKey,
    signUpload: vi.fn(async () => ({ url: "https://up.test/put", method: "PUT", headers: { "Content-Type": "image/png" } })),
    signRead: vi.fn(async () => ({ url: "https://read.test/get", expiresAt: new Date() })),
    inspect: vi.fn(async () => ({ contentType: "image/png", size: 1000 })),
    remove: vi.fn(async () => { }),
}));

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `ca${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
const uuid = () => crypto.randomUUID();

describe.skipIf(!hasDb)("chat attachments (PostgreSQL)", () => {
    let sql, chatService, media, n = 0;
    const ids = {};
    const newUser = async () => {
        const publicId = `${TAG}_${n++}`;
        const id = String(976000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, true)`, [id, publicId, `${publicId}@test.invalid`]);
        await sql(`INSERT INTO profile.info (user_id, surname, name, show_profile) VALUES ($1, 'T', 'T', true)`, [id]);
        ids[publicId] = id;
        return publicId;
    };
    // Friends, so the conversation is accepted on both sides.
    const friends = async () => {
        const [a, b] = [await newUser(), await newUser()];
        await sql(`INSERT INTO community.friend (sender_id, receiver_id, status) VALUES ($1, $2, 'accepted')`, [ids[a], ids[b]]);
        const { conversation } = await chatService.send({ userId: a, toUserId: b, clientId: uuid(), body: "hello" });
        return { a, b, cid: conversation.id };
    };
    const upload = (userId, conversationId, extra = {}) => chatService.createUpload({ userId, conversationId, contentType: "image/png", size: 1000, width: 10, height: 20, ...extra });
    const send = (userId, conversationId, body, attachmentIds) => chatService.send({ userId, conversationId, clientId: uuid(), body, attachmentIds });
    const rowCount = async (publicId) => (await sql(`SELECT count(*)::int AS n FROM community.chat_attachment WHERE public_id = $1`, [publicId])).rows[0].n;

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ chatService } = await import("@/services/chat.service"));
        media = await import("@/lib/chatMedia");
    });

    beforeEach(() => vi.clearAllMocks());

    afterAll(async () => {
        if (!sql) return;
        const run = (text) => sql(text, [`${TAG}%`]).catch((error) => console.error("[chat attachment test cleanup]", error));
        await run(`DELETE FROM community.conversation c WHERE EXISTS (SELECT 1 FROM community.conversation_member m JOIN identity.users u ON u.id = m.user_id WHERE m.conversation_id = c.id AND u.public_id LIKE $1)`);
        await run(`DELETE FROM identity.users WHERE public_id LIKE $1`);
    });

    it("creates an upload with a server-built key and validates type, size and membership", async () => {
        const { a, cid } = await friends();
        const r = await upload(a, cid);
        expect(r.attachmentId).toMatch(/^att_[0-9a-z]{26}$/);
        expect(r.upload).toMatchObject({ method: "PUT" });
        expect(media.signUpload).toHaveBeenCalledWith(`chat/${cid}/${r.attachmentId}.png`, { contentType: "image/png", size: 1000 });
        await expect(upload(a, cid, { contentType: "text/html" })).rejects.toMatchObject({ status: 422 });
        await expect(upload(a, cid, { size: 5_000_001 })).rejects.toMatchObject({ status: 422 });
        await expect(upload(a, cid, { size: 0 })).rejects.toMatchObject({ status: 422 });
        await expect(upload(a, cid, { width: -1 })).rejects.toMatchObject({ status: 422 });
        const stranger = await newUser();
        await expect(upload(stranger, cid)).rejects.toMatchObject({ status: 404 });
    });

    it("refuses uploads in a request conversation", async () => {
        const [a, b] = [await newUser(), await newUser()];
        const { conversation } = await chatService.send({ userId: a, toUserId: b, clientId: uuid(), body: "hi" });
        await expect(upload(a, conversation.id)).rejects.toMatchObject({ status: 422 });
        await expect(upload(b, conversation.id)).rejects.toMatchObject({ status: 422 });
        // Rule 2: after a decline the sender gets the same answer as while pending.
        await chatService.respondRequest({ userId: b, conversationId: conversation.id, accept: false });
        await expect(upload(a, conversation.id)).rejects.toMatchObject({ status: 422, message: "Images can't be sent in a message request" });
        expect(media.signUpload).not.toHaveBeenCalled();
    });

    it("a body-less message with one image is accepted, and listings carry the attachment", async () => {
        const { a, b, cid } = await friends();
        const { attachmentId } = await upload(a, cid);
        const r = await send(a, cid, "", [attachmentId]);
        expect(r.message.body).toBe("");
        expect(r.message.attachments).toEqual([{ id: attachmentId, width: 10, height: 20 }]);
        expect((await chatService.getMessage({ userId: b, messageId: r.message.id })).attachments).toHaveLength(1);
        expect((await chatService.listMessages({ userId: b, conversationId: cid })).items[0].attachments).toHaveLength(1);
        await expect(send(a, cid, "  ", [])).rejects.toMatchObject({ status: 422 });
    });

    it("rejects an attachment from another conversation, user, or already sent", async () => {
        const { a, b, cid } = await friends();
        const other = await friends();
        const foreignConversation = (await upload(other.a, other.cid)).attachmentId;
        const mine = (await upload(a, cid)).attachmentId;
        const theirs = (await upload(b, cid)).attachmentId;
        const sent = (await upload(a, cid)).attachmentId;
        await send(a, cid, "x", [sent]);

        for (const bad of [foreignConversation, theirs, sent, `att_${"0".repeat(26)}`]) {
            await expect(send(a, cid, "y", [mine, bad])).rejects.toMatchObject({ status: 422 });
        }
        // Nothing was attached: the valid one is still unsent.
        expect((await sql(`SELECT message_id FROM community.chat_attachment WHERE public_id = $1`, [mine])).rows[0].message_id).toBeNull();
        await expect(send(a, cid, "z", Array.from({ length: 5 }, () => mine))).resolves.toBeTruthy(); // duplicates collapse
        await expect(send(a, cid, "z", ["a", "b", "c", "d", "e"].map((x) => `att_${x.repeat(26)}`))).rejects.toMatchObject({ status: 422 });
    });

    it("rejects a file whose stored type differs from the declared one", async () => {
        const { a, cid } = await friends();
        const { attachmentId } = await upload(a, cid);
        media.inspect.mockResolvedValueOnce({ contentType: "text/html", size: 1000 });
        await expect(send(a, cid, "x", [attachmentId])).rejects.toMatchObject({ status: 422 });
        expect(media.remove).toHaveBeenCalledWith(`chat/${cid}/${attachmentId}.png`);
        expect(await rowCount(attachmentId)).toBe(0);
    });

    it("rejects a missing or oversized file", async () => {
        const { a, cid } = await friends();
        const missing = (await upload(a, cid)).attachmentId;
        media.inspect.mockResolvedValueOnce(null);
        await expect(send(a, cid, "x", [missing])).rejects.toMatchObject({ status: 422 });
        const big = (await upload(a, cid)).attachmentId;
        media.inspect.mockResolvedValueOnce({ contentType: "image/png", size: 1001 });
        await expect(send(a, cid, "x", [big])).rejects.toMatchObject({ status: 422 });
        expect(await rowCount(missing)).toBe(0);
        expect(await rowCount(big)).toBe(0);
    });

    it("a retried clientId returns the sent message even though its attachments are already attached", async () => {
        const { a, cid } = await friends();
        const { attachmentId } = await upload(a, cid);
        const clientId = uuid();
        const first = await chatService.send({ userId: a, conversationId: cid, clientId, body: "", attachmentIds: [attachmentId] });
        const again = await chatService.send({ userId: a, conversationId: cid, clientId, body: "", attachmentIds: [attachmentId] });
        expect(again).toMatchObject({ created: false, message: { id: first.message.id } });
    });

    it("only current members get a read URL", async () => {
        const { a, b, cid } = await friends();
        const { attachmentId } = await upload(a, cid);
        const unsent = await send(a, cid, "", [attachmentId]);
        expect(await chatService.attachmentReadUrl({ userId: b, attachmentId })).toBe("https://read.test/get");
        expect(media.signRead).toHaveBeenCalledWith(`chat/${cid}/${attachmentId}.png`);
        const stranger = await newUser();
        await expect(chatService.attachmentReadUrl({ userId: stranger, attachmentId })).rejects.toMatchObject({ status: 404 });
        await sql(`UPDATE community.conversation_member SET left_at = now() WHERE conversation_id = (SELECT id FROM community.conversation WHERE public_id = $1) AND user_id = $2`, [cid, ids[b]]);
        await expect(chatService.attachmentReadUrl({ userId: b, attachmentId })).rejects.toMatchObject({ status: 404 });
        await chatService.recallMessage({ userId: a, messageId: unsent.message.id });
        await expect(chatService.attachmentReadUrl({ userId: a, attachmentId })).rejects.toMatchObject({ status: 404 });
    });

    it("purges orphans older than an hour", async () => {
        const { a, cid } = await friends();
        const old = (await upload(a, cid)).attachmentId;
        const fresh = (await upload(a, cid)).attachmentId;
        await sql(`UPDATE community.chat_attachment SET created_at = created_at - interval '61 minutes' WHERE public_id = $1`, [old]);
        const { removed } = await chatService.purgeOrphanAttachments({ limit: 500 });
        expect(removed).toBeGreaterThanOrEqual(1);
        expect(media.remove).toHaveBeenCalledWith(`chat/${cid}/${old}.png`);
        expect(media.remove).not.toHaveBeenCalledWith(`chat/${cid}/${fresh}.png`);
        expect(await rowCount(old)).toBe(0);
        expect(await rowCount(fresh)).toBe(1);
    });

    it("keeps the row of an orphan whose file could not be removed", async () => {
        const { a, cid } = await friends();
        const { attachmentId } = await upload(a, cid);
        await sql(`UPDATE community.chat_attachment SET created_at = created_at - interval '61 minutes' WHERE public_id = $1`, [attachmentId]);
        media.remove.mockRejectedValueOnce(new Error("storage down"));
        vi.spyOn(console, "error").mockImplementation(() => { });
        await chatService.purgeOrphanAttachments({ limit: 1 });
        expect(await rowCount(attachmentId)).toBe(1);
        await sql(`DELETE FROM community.chat_attachment WHERE public_id = $1`, [attachmentId]);
    });
});
