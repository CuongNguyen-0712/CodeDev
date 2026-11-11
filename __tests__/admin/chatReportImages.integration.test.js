// Admin view of a reported message's image: the route's gate (permission, open report, attachment of that message), redirect and audit against real PostgreSQL.
import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null }));
vi.mock("@/lib/session", () => ({
    requireAuthSession: async () => ({ user: { id: session.userId } }),
    getAuthSession: async () => null,
}));
// The second factor is covered by adminMfa.test.js; here it is passed so the permission and report gates are what decide.
vi.mock("@/services/adminMfa.service", async () => ({ ...(await vi.importActual("@/services/adminMfa.service")), mfaRequiredFor: () => false }));
vi.mock("@/lib/rateLimit", async () => {
    const actual = await vi.importActual("@/lib/rateLimit");
    return { ...actual, rateLimiters: { ...actual.rateLimiters, api: { limitRequest: async () => ({ allowed: true, headers: {} }) } } };
});
vi.mock("@/lib/chatMedia", () => ({
    signRead: vi.fn(async () => ({ url: "https://read.test/signed", expiresAt: new Date() })),
    remove: vi.fn(async () => { }),
}));

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `ci${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
const ulid26 = () => crypto.randomBytes(16).toString("hex").slice(0, 26);

describe.skipIf(!hasDb)("admin chat report images (PostgreSQL)", () => {
    let sql, GET, media, n = 0, sender, reporter, admin, plain;
    const ids = {};
    const newUser = async (roles = []) => {
        const publicId = `${TAG}_${n++}`;
        const id = String(976000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, true)`, [id, publicId, `${publicId}@test.invalid`]);
        await sql(`INSERT INTO profile.info (user_id, surname, name) VALUES ($1, 'T', 'T')`, [id]);
        for (const role of roles) await sql(`INSERT INTO identity.user_roles (user_id, role_id) SELECT $1, id FROM identity.roles WHERE code = $2`, [id, role]);
        ids[publicId] = id;
        return publicId;
    };
    // A message from `sender` with one image; reported (open) unless `reported` is false.
    const message = async ({ reported = true } = {}) => {
        const cnv = (await sql(`INSERT INTO community.conversation (public_id, kind, direct_key) VALUES ($1, 'direct', $2) RETURNING id`, [`cnv_${ulid26()}`, `${TAG}:${ulid26()}`])).rows[0].id;
        for (const u of [sender, reporter]) await sql(`INSERT INTO community.conversation_member (conversation_id, user_id, state) VALUES ($1, $2, 'accepted')`, [cnv, ids[u]]);
        const msg = (await sql(`INSERT INTO community.chat_message (public_id, conversation_id, sender_id, client_id, body) VALUES ($1, $2, $3, $4, '') RETURNING id, public_id`,
            [`msg_${ulid26()}`, cnv, ids[sender], crypto.randomUUID()])).rows[0];
        const att = `att_${ulid26()}`;
        const key = `chat/${TAG}/${ulid26()}.png`;
        await sql(`INSERT INTO community.chat_attachment (public_id, conversation_id, uploader_id, message_id, storage_key, content_type, size_bytes) VALUES ($1, $2, $3, $4, $5, 'image/png', 10)`,
            [att, cnv, ids[sender], msg.id, key]);
        if (reported) await sql(`INSERT INTO community.chat_report (message_id, reporter_id, reason) VALUES ($1, $2, 'Spam or abuse')`, [msg.id, ids[reporter]]);
        return { id: msg.id, messageId: msg.public_id, attachmentId: att, key };
    };
    const view = (as, messageId, attachmentId) => {
        session.userId = as;
        return GET(new Request(`http://localhost/api/admin/chat-reports/${messageId}/attachments/${attachmentId}`), { params: Promise.resolve({ id: messageId, attachmentId }) });
    };
    const audits = async (messageId) => (await sql(`SELECT action, target_type, target_id, after FROM identity.audit_log WHERE actor_id = $1 AND target_id = $2`, [ids[admin], messageId])).rows;

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ GET } = await import("@/app/api/admin/chat-reports/[id]/attachments/[attachmentId]/route"));
        media = await import("@/lib/chatMedia");
        sender = await newUser();
        reporter = await newUser();
        admin = await newUser(["admin"]);
        plain = await newUser();
    });

    beforeEach(() => vi.clearAllMocks());

    afterAll(async () => {
        if (!sql) return;
        const run = (text) => sql(text, [`${TAG}%`]).catch((error) => console.error("[chat report image test cleanup]", error));
        await run(`DELETE FROM community.conversation c WHERE EXISTS (SELECT 1 FROM community.conversation_member m JOIN identity.users u ON u.id = m.user_id WHERE m.conversation_id = c.id AND u.public_id LIKE $1)`);
        await run(`DELETE FROM identity.audit_log WHERE actor_id IN (SELECT id FROM identity.users WHERE public_id LIKE $1)`);
        await run(`DELETE FROM identity.users WHERE public_id LIKE $1`);
    });

    it("a user without chat.moderate gets 403 and no URL", async () => {
        const m = await message();
        for (const who of [plain, sender, reporter]) expect((await view(who, m.messageId, m.attachmentId)).status).toBe(403);
        expect(media.signRead).not.toHaveBeenCalled();
    });

    it("404 when the message has no open report: never reported, or its reports were closed", async () => {
        const never = await message({ reported: false });
        expect((await view(admin, never.messageId, never.attachmentId)).status).toBe(404);
        const closed = await message();
        await sql(`UPDATE community.chat_report SET resolved_at = now() WHERE message_id = $1`, [closed.id]);
        expect((await view(admin, closed.messageId, closed.attachmentId)).status).toBe(404);
        expect(media.signRead).not.toHaveBeenCalled();
        expect(await audits(closed.messageId)).toEqual([]);
    });

    it("404 for an attachment of another message, even one that is reported too", async () => {
        const [a, b] = [await message(), await message()];
        expect((await view(admin, a.messageId, b.attachmentId)).status).toBe(404);
        expect((await view(admin, a.messageId, `att_${ulid26()}`)).status).toBe(404);
        expect((await view(admin, `msg_${ulid26()}`, a.attachmentId)).status).toBe(404);
        expect((await view(admin, "not-an-id", a.attachmentId)).status).toBe(400);
        expect(media.signRead).not.toHaveBeenCalled();
    });

    it("302 to the signed URL, cached privately, and one audit row per view", async () => {
        const m = await message();
        const res = await view(admin, m.messageId, m.attachmentId);
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe("https://read.test/signed");
        expect(res.headers.get("Cache-Control")).toBe("private, max-age=240");
        expect(media.signRead).toHaveBeenCalledWith(m.key);
        expect(await audits(m.messageId)).toEqual([{
            action: "chat.report.view_image", target_type: "chat_message", target_id: m.messageId, after: { attachmentId: m.attachmentId },
        }]);
    });
});
