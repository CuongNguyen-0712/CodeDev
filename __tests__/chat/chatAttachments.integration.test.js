// Chat attachments, images and files (upload, send, read URL, recall, orphan purge) against real PostgreSQL; storage is mocked.
import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chatMedia", async () => ({
    storageFor: vi.fn(() => "s3"),
    storageKeyFor: (await vi.importActual("@/lib/chatMedia")).storageKeyFor,
    uploadTicket: vi.fn(async () => ({ url: "https://up.test/put", method: "PUT", headers: { "Content-Type": "image/png" } })),
    readUrl: vi.fn(async () => "https://read.test/get"),
    // By default the stored object is exactly what was declared.
    inspect: vi.fn(async (att) => ({ contentType: att.contentType, size: att.size })),
    remove: vi.fn(async () => { }),
}));

// Real job wiring, with the delete queue observable: queued items must not carry file names to Inngest.
const queueAttachmentDelete = vi.hoisted(() => vi.fn(async () => { }));
vi.mock("@/services/chatJobs.service", async (original) => ({ ...(await original()), queueAttachmentDelete }));

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
    const upload = (userId, conversationId, extra = {}) => chatService.createUpload({ userId, conversationId, kind: "image", name: "cat.png", contentType: "image/png", size: 1000, width: 10, height: 20, ...extra });
    const uploadFile = (userId, conversationId, extra = {}) => chatService.createUpload({ userId, conversationId, kind: "file", name: "a.pdf", size: 1000, ...extra });
    const row = async (publicId) => (await sql(`SELECT kind, provider, storage_key, content_type, size_bytes, file_name, width, height FROM community.chat_attachment WHERE public_id = $1`, [publicId])).rows[0];
    const setProvider = (publicId, provider) => sql(`UPDATE community.chat_attachment SET provider = $2 WHERE public_id = $1`, [publicId, provider]);
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
        expect(media.storageFor).toHaveBeenCalledWith("image");
        expect(media.uploadTicket).toHaveBeenCalledWith({
            kind: "image", provider: "s3", storageKey: `chat/${cid}/${r.attachmentId}.png`, contentType: "image/png", size: 1000, fileName: null, conversationId: cid,
        });
        expect(await row(r.attachmentId)).toMatchObject({ kind: "image", provider: "s3", file_name: null, width: 10, height: 20 });
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
        expect(media.uploadTicket).not.toHaveBeenCalled();
    });

    it("refuses any attachment in a request conversation", async () => {
        const [a, b] = [await newUser(), await newUser()];
        const { conversation } = await chatService.send({ userId: a, toUserId: b, clientId: uuid(), body: "hi" });
        await expect(uploadFile(a, conversation.id)).rejects.toMatchObject({ status: 422 });
        await expect(uploadFile(b, conversation.id)).rejects.toMatchObject({ status: 422 });
        expect(media.uploadTicket).not.toHaveBeenCalled();
    });

    it("accepts a pdf and stores the server-chosen content type and clean name", async () => {
        const { a, cid } = await friends();
        const r = await uploadFile(a, cid, { name: "../../a\u0007.pdf", contentType: "text/html", width: 5, height: 5 });
        expect(media.storageFor).toHaveBeenCalledWith("file");
        expect(media.uploadTicket).toHaveBeenCalledWith({
            kind: "file", provider: "s3", storageKey: `chat/${cid}/${r.attachmentId}.pdf`, contentType: "application/pdf", size: 1000, fileName: "a.pdf", conversationId: cid,
        });
        expect(await row(r.attachmentId)).toEqual({
            kind: "file", provider: "s3", storage_key: `chat/${cid}/${r.attachmentId}.pdf`, content_type: "application/pdf", size_bytes: 1000, file_name: "a.pdf", width: null, height: null,
        });
        const windows = await uploadFile(a, cid, { name: "C:\\Users\\me\\Notes.MD" });
        expect(await row(windows.attachmentId)).toMatchObject({ file_name: "Notes.MD", content_type: "text/markdown", storage_key: `chat/${cid}/${windows.attachmentId}.md` });
        const longest = `${"x".repeat(251)}.txt`;
        const long = await uploadFile(a, cid, { name: `some/dir/${longest}` });
        expect((await row(long.attachmentId)).file_name).toBe(longest);
        for (const name of ["dir/", " \u0001 ", "\u007f"]) await expect(uploadFile(a, cid, { name })).rejects.toMatchObject({ status: 422 });
    });

    it("strips bidi and C1 controls, so a name cannot disguise its real extension", async () => {
        const { a, cid } = await friends();
        const r = await uploadFile(a, cid, { name: "invoice\u202efdp.zip" });
        expect(await row(r.attachmentId)).toMatchObject({ file_name: "invoicefdp.zip", content_type: "application/zip" });
        const all = "\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\u200e\u200f\u0080\u0085\u009f";
        const r2 = await uploadFile(a, cid, { name: `n${all}otes.txt` });
        expect((await row(r2.attachmentId)).file_name).toBe("notes.txt");
        await expect(uploadFile(a, cid, { name: all })).rejects.toMatchObject({ status: 422 });
    });

    it("refuses .exe, .html and .svg files", async () => {
        const { a, cid } = await friends();
        for (const name of ["setup.exe", "page.html", "logo.svg", "README", "archive.tar.gz", "__proto__.__proto__"]) {
            await expect(uploadFile(a, cid, { name, contentType: "application/pdf" })).rejects.toMatchObject({ status: 422, message: "This file type can't be sent." });
        }
        expect(media.uploadTicket).not.toHaveBeenCalled();
    });

    it("refuses a 15000001-byte file", async () => {
        const { a, cid } = await friends();
        await expect(uploadFile(a, cid, { size: 15_000_001 })).rejects.toMatchObject({ status: 422 });
        await expect(uploadFile(a, cid, { size: 0 })).rejects.toMatchObject({ status: 422 });
        await expect(uploadFile(a, cid, { size: 15_000_000 })).resolves.toMatchObject({ attachmentId: expect.any(String) });
    });

    it("counts images and files together toward 4 attachments", async () => {
        const { a, cid } = await friends();
        const images = [(await upload(a, cid)).attachmentId, (await upload(a, cid)).attachmentId];
        const files = [(await uploadFile(a, cid)).attachmentId, (await uploadFile(a, cid)).attachmentId, (await uploadFile(a, cid)).attachmentId];
        await expect(send(a, cid, "", [...images, ...files])).rejects.toMatchObject({ status: 422 });
        await expect(send(a, cid, "", [...images, ...files.slice(0, 2)])).resolves.toMatchObject({ created: true });
    });

    it("returns file attachments with name and size, images with width and height", async () => {
        const { a, b, cid } = await friends();
        const image = (await upload(a, cid)).attachmentId;
        const file = (await uploadFile(a, cid, { name: "report.pdf", size: 1234 })).attachmentId;
        const r = await send(a, cid, "", [file, image]);
        const expected = [{ id: image, kind: "image", width: 10, height: 20 }, { id: file, kind: "file", name: "report.pdf", size: 1234 }];
        expect(r.message.attachments).toEqual(expected);
        expect((await chatService.getMessage({ userId: b, messageId: r.message.id })).attachments).toEqual(expected);
    });

    it("previews a file-only message as [file]", async () => {
        const { a, b, cid } = await friends();
        await send(a, cid, "", [(await uploadFile(a, cid)).attachmentId]);
        expect((await chatService.listConversations({ userId: b, tab: "all" })).items[0].lastMessage.preview).toBe("[file]");
        await chatService.markRead({ userId: b, conversationId: cid, seq: "9223372036854775807" });
        await send(a, cid, "", [(await uploadFile(a, cid)).attachmentId]);
        expect((await chatService.pushSummary({ userId: b, conversationId: cid })).body).toBe("[file]");
        await chatService.markRead({ userId: b, conversationId: cid, seq: "9223372036854775807" });
        await send(a, cid, "", [(await uploadFile(a, cid)).attachmentId, (await upload(a, cid)).attachmentId]);
        expect((await chatService.listConversations({ userId: b, tab: "all" })).items[0].lastMessage.preview).toBe("[image]");
        expect((await chatService.pushSummary({ userId: b, conversationId: cid })).body).toBe("[image]");
        await send(a, cid, "see attached", [(await uploadFile(a, cid)).attachmentId]);
        expect((await chatService.listConversations({ userId: b, tab: "all" })).items[0].lastMessage.preview).toBe("see attached");
    });

    it("recall and purge delete through each row's provider", async () => {
        const { a, b, cid } = await friends();
        const image = (await upload(a, cid)).attachmentId;
        const file = (await uploadFile(a, cid)).attachmentId;
        await setProvider(image, "cloudinary");
        await setProvider(file, "upstash");
        const imageKey = (await row(image)).storage_key;
        const fileKey = (await row(file)).storage_key;
        const sent = await send(a, cid, "", [image, file]);
        expect(media.inspect.mock.calls.map(([att]) => att.provider).sort()).toEqual(["cloudinary", "upstash"]);

        await chatService.attachmentReadUrl({ userId: b, attachmentId: file });
        expect(media.readUrl).toHaveBeenCalledWith({ kind: "file", provider: "upstash", storageKey: fileKey, contentType: "application/pdf", fileName: "a.pdf" });

        media.remove.mockRejectedValue(new Error("storage down"));
        vi.spyOn(console, "error").mockImplementation(() => { });
        await chatService.recallMessage({ userId: a, messageId: sent.message.id });
        // remove itself gets each row's provider (in process, so the full row is fine here).
        expect(media.remove.mock.calls.map(([att]) => att)).toEqual(expect.arrayContaining([
            { kind: "image", provider: "cloudinary", storageKey: imageKey, contentType: "image/png", fileName: null },
            { kind: "file", provider: "upstash", storageKey: fileKey, contentType: "application/pdf", fileName: "a.pdf" },
        ]));
        expect(media.remove).toHaveBeenCalledTimes(2);
        media.remove.mockReset().mockResolvedValue(undefined);
        // Both deletes failed, so both go to Inngest as { kind, provider, storageKey } only: no file name or type leaves the app.
        expect(queueAttachmentDelete).toHaveBeenCalledTimes(1);
        const queued = queueAttachmentDelete.mock.calls[0][0];
        expect(queued).toEqual(expect.arrayContaining([
            { kind: "image", provider: "cloudinary", storageKey: imageKey },
            { kind: "file", provider: "upstash", storageKey: fileKey },
        ]));
        expect(queued).toHaveLength(2);
        for (const item of queued) expect(Object.keys(item).sort()).toEqual(["kind", "provider", "storageKey"]);

        media.remove.mockClear();
        const orphan = (await uploadFile(a, cid, { name: "old.zip" })).attachmentId;
        await setProvider(orphan, "upstash");
        await sql(`UPDATE community.chat_attachment SET created_at = created_at - interval '61 minutes' WHERE public_id = $1`, [orphan]);
        await chatService.purgeOrphanAttachments({ limit: 500 });
        expect(media.remove).toHaveBeenCalledWith(expect.objectContaining({ kind: "file", provider: "upstash", storageKey: `chat/${cid}/${orphan}.zip`, fileName: "old.zip" }));
        expect(await rowCount(orphan)).toBe(0);
    });

    it("a body-less message with one image is accepted, and listings carry the attachment", async () => {
        const { a, b, cid } = await friends();
        const { attachmentId } = await upload(a, cid);
        const r = await send(a, cid, "", [attachmentId]);
        expect(r.message.body).toBe("");
        expect(r.message.attachments).toEqual([{ id: attachmentId, kind: "image", width: 10, height: 20 }]);
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
        expect(media.remove).toHaveBeenCalledWith(expect.objectContaining({ provider: "s3", storageKey: `chat/${cid}/${attachmentId}.png` }));
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
        expect(media.readUrl).toHaveBeenCalledWith({ kind: "image", provider: "s3", storageKey: `chat/${cid}/${attachmentId}.png`, contentType: "image/png", fileName: null });
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
        const purgedKeys = media.remove.mock.calls.map(([att]) => att.storageKey);
        expect(purgedKeys).toContain(`chat/${cid}/${old}.png`);
        expect(purgedKeys).not.toContain(`chat/${cid}/${fresh}.png`);
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
