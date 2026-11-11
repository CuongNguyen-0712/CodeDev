// Chat schema constraints against real PostgreSQL; test users (and their conversations) are deleted afterwards.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `cs${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("chat schema (PostgreSQL)", () => {
    let sql, u1, u2, convId, msgId;
    const newUser = async (name) => {
        const publicId = `${TAG}_${name}`;
        const id = String(974000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, true)`, [id, publicId, `${publicId}@test.invalid`]);
        return id;
    };
    const addMessage = (clientId, body = "hi") =>
        sql(`INSERT INTO community.chat_message (public_id, conversation_id, sender_id, client_id, body) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [`msg_${TAG}${crypto.randomBytes(3).toString("hex")}`, convId, u1, clientId, body]);
    const addAttachment = (type, size) =>
        sql(`INSERT INTO community.chat_attachment (public_id, conversation_id, uploader_id, storage_key, content_type, size_bytes) VALUES ($1,$2,$3,$4,$5,$6)`,
            [`att_${TAG}${crypto.randomBytes(3).toString("hex")}`, convId, u1, `k_${TAG}_${crypto.randomBytes(4).toString("hex")}`, type, size]);

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        u1 = await newUser("a");
        u2 = await newUser("b");
        convId = (await sql(`INSERT INTO community.conversation (public_id, kind, direct_key) VALUES ($1,'direct',$2) RETURNING id`, [`cnv_${TAG}`, `${TAG}:k`])).rows[0].id;
    });

    afterAll(async () => {
        if (!sql) return;
        try {
            await sql(`DELETE FROM community.conversation WHERE public_id LIKE $1`, [`cnv_${TAG}%`]);
        } finally {
            await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}%`]);
        }
    });

    it("rejects a direct conversation without direct_key", async () => {
        await expect(sql(`INSERT INTO community.conversation (public_id, kind) VALUES ($1,'direct')`, [`cnv_${TAG}a`])).rejects.toThrow();
    });
    it("rejects a second message with the same (sender_id, client_id)", async () => {
        const clientId = crypto.randomUUID();
        await addMessage(clientId);
        await expect(addMessage(clientId)).rejects.toThrow(/unique/i);
    });
    it("rejects a body over 4000 chars", async () => {
        await addMessage(crypto.randomUUID(), "x".repeat(4000));
        await expect(addMessage(crypto.randomUUID(), "x".repeat(4001))).rejects.toThrow();
    });
    it("rejects image/svg+xml attachments and size 5000001", async () => {
        await addAttachment("image/png", 5000000);
        await expect(addAttachment("image/svg+xml", 100)).rejects.toThrow();
        await expect(addAttachment("image/png", 5000001)).rejects.toThrow();
    });
    it("rejects a self block", async () => {
        await expect(sql(`INSERT INTO community.user_block (blocker_id, blocked_id) VALUES ($1,$1)`, [u1])).rejects.toThrow();
    });
    it("has dropped community.messages", async () => {
        expect((await sql(`SELECT to_regclass('community.messages') AS t`)).rows[0].t).toBeNull();
    });
    it("grants chat.moderate to admin", async () => {
        const { rows } = await sql(`SELECT 1 FROM identity.role_permissions rp JOIN identity.roles r ON r.id = rp.role_id
            JOIN identity.permissions p ON p.id = rp.permission_id WHERE r.code = 'admin' AND p.resource = 'chat' AND p.action = 'moderate'`);
        expect(rows).toHaveLength(1);
    });

    describe("attachment kind, provider and file name (revision 2)", () => {
        const add = (cols) => {
            const row = { kind: "image", provider: "s3", content_type: "image/png", size_bytes: 100, file_name: null, ...cols };
            return sql(`INSERT INTO community.chat_attachment (public_id, conversation_id, uploader_id, storage_key, kind, provider, content_type, size_bytes, file_name)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [`att_${TAG}${crypto.randomBytes(3).toString("hex")}`, convId, u1, `k_${TAG}_${crypto.randomBytes(4).toString("hex")}`,
                    row.kind, row.provider, row.content_type, row.size_bytes, row.file_name]);
        };
        const pdf = { kind: "file", provider: "upstash", content_type: "application/pdf", file_name: "a.pdf" };

        it("accepts a 15 MB pdf file row and refuses 15000001 bytes", async () => {
            await add({ ...pdf, size_bytes: 15000000 });
            await expect(add({ ...pdf, size_bytes: 15000001 })).rejects.toThrow();
        });
        it("refuses a file row without file_name and an image over 5 MB", async () => {
            await expect(add({ ...pdf, file_name: null })).rejects.toThrow();
            await expect(add({ size_bytes: 5000001 })).rejects.toThrow();
        });
        it("refuses provider 'cloudinary' for a file and 'upstash' for an image", async () => {
            await add({ provider: "cloudinary" });
            await expect(add({ ...pdf, provider: "cloudinary" })).rejects.toThrow();
            await expect(add({ provider: "upstash" })).rejects.toThrow();
        });
        it("keeps existing image rows valid (kind defaults to image, provider to s3)", async () => {
            await addAttachment("image/webp", 10);
            const { rows } = await sql(`SELECT kind, provider, file_name FROM community.chat_attachment WHERE storage_key LIKE $1 AND content_type = 'image/webp'`, [`k_${TAG}%`]);
            expect(rows[0]).toEqual({ kind: "image", provider: "s3", file_name: null });
        });
    });
});
