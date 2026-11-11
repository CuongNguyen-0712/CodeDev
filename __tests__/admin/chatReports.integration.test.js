// Reported chat messages: queue privacy, hide / dismiss and audit against real PostgreSQL; test users and conversations are deleted afterwards.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chatMedia", () => ({ remove: vi.fn(async () => { }) }));

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `cr${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
const uuid = () => crypto.randomUUID();
const ulid26 = () => crypto.randomBytes(16).toString("hex").slice(0, 26);

describe.skipIf(!hasDb)("admin chat reports (PostgreSQL)", () => {
    let sql, adminChatService, requirePermission, adminChatReportActionSchema;
    const ids = {};
    let n = 0, sender, reporterA, reporterB, admin, plain;
    const newUser = async (roles = []) => {
        const publicId = `${TAG}_${n++}`;
        const id = String(976000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, true)`, [id, publicId, `${publicId}@test.invalid`]);
        await sql(`INSERT INTO profile.info (user_id, surname, name) VALUES ($1, 'T', 'T')`, [id]);
        for (const role of roles) await sql(`INSERT INTO identity.user_roles (user_id, role_id) SELECT $1, id FROM identity.roles WHERE code = $2`, [id, role]);
        ids[publicId] = id;
        return publicId;
    };
    // A direct conversation with `count` messages from `sender` (the last one is returned) and one attachment on it.
    const conversation = async (count = 2) => {
        const cnv = (await sql(`INSERT INTO community.conversation (public_id, kind, direct_key) VALUES ($1, 'direct', $2) RETURNING id`, [`cnv_${ulid26()}`, `${TAG}:${ulid26()}`])).rows[0].id;
        for (const u of [sender, reporterA, reporterB]) await sql(`INSERT INTO community.conversation_member (conversation_id, user_id, state) VALUES ($1, $2, 'accepted')`, [cnv, ids[u]]);
        let last;
        for (let i = 0; i < count; i++) {
            last = (await sql(`INSERT INTO community.chat_message (public_id, conversation_id, sender_id, client_id, body) VALUES ($1, $2, $3, $4, $5) RETURNING id, public_id`,
                [`msg_${ulid26()}`, cnv, ids[sender], uuid(), `body ${i} of ${cnv}`])).rows[0];
        }
        await sql(`INSERT INTO community.chat_attachment (public_id, conversation_id, uploader_id, message_id, storage_key, content_type, size_bytes) VALUES ($1, $2, $3, $4, $5, 'image/png', 10)`,
            [`att_${ulid26()}`, cnv, ids[sender], last.id, `secret/${TAG}/${ulid26()}.png`]);
        return { cnv, message: last };
    };
    const report = (message, by, reason = "Spam or abuse") => sql(`INSERT INTO community.chat_report (message_id, reporter_id, reason) VALUES ($1, $2, $3)`, [message.id, ids[by], reason]);
    const queue = async (publicIds) => (await adminChatService.list({})).items.filter((i) => publicIds.includes(i.messageId));
    const actor = () => ({ id: ids[admin], publicId: admin });
    const act = (messageId, action, reason) => adminChatService.act({ actor: actor(), messageId, action, reason, ip: "127.0.0.1" });

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ adminChatService } = await import("@/services/adminChat.service"));
        ({ requirePermission } = await import("@/lib/authz"));
        ({ adminChatReportActionSchema } = await import("@/lib/validation/admin"));
        sender = await newUser();
        reporterA = await newUser();
        reporterB = await newUser();
        admin = await newUser(["admin"]);
        plain = await newUser();
    });

    afterAll(async () => {
        if (!sql) return;
        const run = (text) => sql(text, [`${TAG}%`]).catch((error) => console.error("[chat report test cleanup]", error));
        await run(`DELETE FROM community.conversation c WHERE EXISTS (SELECT 1 FROM community.conversation_member m JOIN identity.users u ON u.id = m.user_id WHERE m.conversation_id = c.id AND u.public_id LIKE $1)`);
        await run(`DELETE FROM identity.audit_log WHERE actor_id IN (SELECT id FROM identity.users WHERE public_id LIKE $1)`);
        await run(`DELETE FROM identity.users WHERE public_id LIKE $1`);
    });

    it("lists only the reported message, with reasons and counts, and leaks nothing else", async () => {
        const { message } = await conversation(3);
        await report(message, reporterA, "Reason one here");
        await report(message, reporterB, "Reason two here");
        const items = await queue([message.public_id]);
        expect(items).toHaveLength(1);
        const [item] = items;
        expect(item).toMatchObject({
            messageId: message.public_id, body: expect.stringContaining("body 2"), conversationKind: "direct", reports: 2,
            sender: { id: sender, username: sender, nickname: null }, attachments: [expect.stringMatching(/^att_/)],
        });
        expect(item.reasons.sort()).toEqual(["Reason one here", "Reason two here"]);
        expect(new Date(item.firstReportedAt).getTime()).not.toBeNaN();
        // Other messages of the conversation, conversation ids, members and storage keys never leave.
        const text = JSON.stringify((await adminChatService.list({})).items);
        expect(text).not.toContain("body 0");
        expect(text).not.toContain("body 1");
        expect(text).not.toContain("cnv_");
        expect(text).not.toContain("secret/");
        expect(text).not.toContain(reporterA);
    });

    it("hide unsends the message, closes its reports and writes an audit row", async () => {
        const { message } = await conversation();
        await report(message, reporterA);
        await report(message, reporterB);
        expect(await act(message.public_id, "hide", "Violates the rules")).toEqual({ changed: true });
        expect((await sql(`SELECT deleted_at IS NOT NULL AS deleted, body FROM community.chat_message WHERE id = $1`, [message.id])).rows[0]).toEqual({ deleted: true, body: "" });
        expect((await sql(`SELECT count(*)::int AS n FROM community.chat_report WHERE message_id = $1 AND resolved_at IS NOT NULL AND resolved_by = $2`, [message.id, ids[admin]])).rows[0].n).toBe(2);
        expect(await queue([message.public_id])).toHaveLength(0);
        const audit = (await sql(`SELECT action, target_type, target_id, reason FROM identity.audit_log WHERE actor_id = $1 AND target_id = $2`, [ids[admin], message.public_id])).rows;
        expect(audit).toEqual([{ action: "chat.report.hide", target_type: "chat_message", target_id: message.public_id, reason: "Violates the rules" }]);
        await expect(act(message.public_id, "hide", "Violates the rules")).rejects.toMatchObject({ status: 409 });
    });

    it("dismiss closes the reports, keeps the message and writes an audit row", async () => {
        const { message } = await conversation();
        await report(message, reporterA);
        expect(await act(message.public_id, "dismiss")).toEqual({ changed: true });
        expect((await sql(`SELECT deleted_at IS NULL AS live FROM community.chat_message WHERE id = $1`, [message.id])).rows[0].live).toBe(true);
        expect(await queue([message.public_id])).toHaveLength(0);
        expect((await sql(`SELECT action FROM identity.audit_log WHERE actor_id = $1 AND target_id = $2`, [ids[admin], message.public_id])).rows).toEqual([{ action: "chat.report.dismiss" }]);
        await expect(act(message.public_id, "dismiss")).rejects.toMatchObject({ status: 409 });
        await expect(act(`msg_${ulid26()}`, "dismiss")).rejects.toMatchObject({ status: 404 });
    });

    it("pages by first report time and id without gaps or repeats; a bad cursor is 400", async () => {
        const mine = [];
        for (let i = 0; i < 3; i++) {
            const { message } = await conversation(1);
            await report(message, reporterA);
            mine.push(message.public_id);
        }
        const seen = [];
        let cursor = null;
        for (let k = 0; k < 500; k++) {
            const page = await adminChatService.list({ cursor, pageSize: 1 });
            seen.push(...page.items.map((i) => i.messageId));
            if (!(cursor = page.nextCursor)) break;
        }
        expect(seen.filter((id) => mine.includes(id)).sort()).toEqual([...mine].sort());
        expect(new Set(seen).size).toBe(seen.length);
        await expect(adminChatService.list({ cursor: "bogus" })).rejects.toMatchObject({ status: 400 });
    });

    it("needs chat.moderate: an admin passes, a plain user gets 403", async () => {
        expect((await requirePermission(admin, ["admin.read", "chat.moderate"], { mfa: false })).publicId).toBe(admin);
        await expect(requirePermission(plain, ["admin.read", "chat.moderate"], { mfa: false })).rejects.toMatchObject({ status: 403 });
    });

    it("the action schema takes hide or dismiss, and hide needs a reason", () => {
        expect(adminChatReportActionSchema.safeParse({ action: "dismiss" }).success).toBe(true);
        expect(adminChatReportActionSchema.safeParse({ action: "hide", reason: "Violates the rules" }).success).toBe(true);
        expect(adminChatReportActionSchema.safeParse({ action: "hide" }).success).toBe(false);
        expect(adminChatReportActionSchema.safeParse({ action: "delete" }).success).toBe(false);
        expect(adminChatReportActionSchema.safeParse({ action: "dismiss", reason: "x".repeat(501) }).success).toBe(false);
    });
});
