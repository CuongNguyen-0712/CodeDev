#!/usr/bin/env node
/**
 * Dead letters (ops.dead_letters, docs/queue-execution-plan.md 2.9): background work that failed for good.
 *
 *   npm run dlq                         list the open ones
 *   npm run dlq -- resolve <id> [note]  mark one handled
 *   npm run dlq -- retry <id>           outbox: make the event pending again (the sweeper or the
 *                                       in-process worker sends it); Inngest: send the original event again
 *   --env .env.production               another env file (default .env.local)
 *
 * A failed code run is not retried here: the learner submits again (no attempt was used).
 */
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const dotenv = require("dotenv");
const { Client } = require("pg");

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const envFile = envIndex >= 0 ? args.splice(envIndex, 2)[1] : null;
dotenv.config({ path: path.resolve(root, envFile || ".env.local"), quiet: true, override: true });
const [command = "list", id, ...note] = args;

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
}

const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const one = async (text, params) => (await db.query(text, params)).rows[0];

/** Sends an event to Inngest: the event API with INNGEST_EVENT_KEY, or the local dev server. */
async function sendEvent(event) {
    const key = process.env.INNGEST_EVENT_KEY;
    const base = key ? "https://inn.gs" : process.env.INNGEST_BASE_URL || "http://127.0.0.1:8288";
    if (!key && !process.env.INNGEST_DEV) throw new Error("Set INNGEST_EVENT_KEY (or INNGEST_DEV=1 for the dev server)");
    const res = await fetch(`${base}/e/${key || "dev"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
    });
    if (!res.ok) throw new Error(`Inngest answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

try {
    if (command === "list") {
        const { rows } = await db.query(
            `SELECT id, source, kind, ref, attempts, left(error, 120) AS error, created_at
             FROM ops.dead_letters WHERE resolved_at IS NULL ORDER BY id DESC LIMIT 100;`
        );
        if (rows.length === 0) console.log("No open dead letters.");
        else console.table(rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() })));
    } else if (command === "resolve" && id) {
        const done = await one(
            `UPDATE ops.dead_letters SET resolved_at = now(), resolution = $2 WHERE id = $1 AND resolved_at IS NULL RETURNING id;`,
            [id, note.join(" ") || "resolved by hand"]
        );
        console.log(done ? `Resolved ${id}.` : `No open dead letter ${id}.`);
    } else if (command === "retry" && id) {
        const letter = await one(`SELECT * FROM ops.dead_letters WHERE id = $1 AND resolved_at IS NULL;`, [id]);
        if (!letter) throw new Error(`No open dead letter ${id}`);

        if (letter.source === "outbox") {
            await db.query(
                `UPDATE identity.auth_outbox
                 SET dead_at = NULL, attempts = 0, available_at = now(), published_at = NULL
                 WHERE id = $1 AND processed_at IS NULL;`,
                [letter.ref]
            );
        } else if (String(letter.kind).startsWith("code-run")) {
            throw new Error("A code run is not retried: the learner submits again (no attempt was used). Resolve it instead.");
        } else if (letter.payload?.name) {
            // A new id: the original one is deduplicated by Inngest for 24 hours.
            const { id: _oldId, ts: _ts, ...event } = letter.payload;
            await sendEvent(event);
        } else {
            throw new Error("This dead letter has no event to send again");
        }

        await db.query(`UPDATE ops.dead_letters SET resolved_at = now(), resolution = 'retried' WHERE id = $1;`, [id]);
        console.log(`Retried ${id} (${letter.source} ${letter.kind}).`);
    } else {
        console.log("Usage: npm run dlq [-- list | resolve <id> [note] | retry <id>] [--env <file>]");
        process.exitCode = 1;
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await db.end();
}
