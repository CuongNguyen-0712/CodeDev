import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Auth outbox retry limits and dead letters (migration 20261030_001) against a real PostgreSQL.
 * Uses an event type without a handler, so nothing leaves the database.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TYPE = `test.no_handler_${Date.now().toString(36)}`;

let sql, dbPool, outbox;
const one = async (text, params) => (await sql(text, params)).rows[0];
const insert = (extra = {}) => one(
    `INSERT INTO identity.auth_outbox (event_type, payload, max_attempts) VALUES ($1, '{}'::jsonb, $2) RETURNING id::text`,
    [TYPE, extra.maxAttempts ?? 8]
).then((r) => r.id);

describe.skipIf(!hasDb)("auth outbox delivery (PostgreSQL)", () => {
    beforeAll(async () => {
        ({ sql, dbPool } = await import("@/lib/db"));
        outbox = await import("@/services/authOutbox.service");
    });

    afterAll(async () => {
        if (!dbPool) return;
        await sql(`DELETE FROM ops.dead_letters WHERE kind = $1`, [TYPE]);
        await sql(`DELETE FROM identity.auth_outbox WHERE event_type = $1`, [TYPE]);
    });

    it("marks an event dead after max_attempts and keeps one dead letter", async () => {
        const id = await insert({ maxAttempts: 2 });
        for (let i = 0; i < 3; i++) {
            await outbox.processAuthOutbox({ ids: [id] });
            await sql(`UPDATE identity.auth_outbox SET available_at = now() WHERE id = $1`, [id]); // skip the backoff
        }

        const row = await one(`SELECT attempts, dead_at IS NOT NULL AS dead FROM identity.auth_outbox WHERE id = $1`, [id]);
        expect(row).toEqual({ attempts: 2, dead: true });
        const letters = await one(`SELECT COUNT(*)::int AS n FROM ops.dead_letters WHERE source = 'outbox' AND ref = $1`, [id]);
        expect(letters.n).toBe(1);
    });

    it("delivers through deliverAuthOutboxEvent: no handler is permanent, a done event is a no-op", async () => {
        const id = await insert();
        await expect(outbox.deliverAuthOutboxEvent(id)).rejects.toMatchObject({ name: "NonRetriableError" });

        await sql(`UPDATE identity.auth_outbox SET processed_at = now() WHERE id = $1`, [id]);
        await expect(outbox.deliverAuthOutboxEvent(id)).resolves.toEqual({ status: "processed" });

        const killed = await insert();
        await outbox.killAuthOutboxEvent(killed, "gave up");
        expect(await one(`SELECT dead_at IS NOT NULL AS dead FROM identity.auth_outbox WHERE id = $1`, [killed])).toEqual({ dead: true });
        await expect(outbox.deliverAuthOutboxEvent(killed)).resolves.toEqual({ status: "skipped" });
    });
});
