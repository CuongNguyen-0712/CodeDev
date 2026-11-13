#!/usr/bin/env node
/**
 * Seeds synthetic load-test users (lt_00001 ...) into a loadtest* database.
 *
 *   npm run load:seed -- --env .env.loadtest [--url <db url>] [--users 5000] [--reset] [--yes]
 *
 * Per user: a verified, onboarded account, 3 course registrations, 20 exp and 10 point entries, accepted and
 * pending friends, 3 direct conversations with 20 messages each. Writes tests/loadtest/users.json.
 * The target comes from LOADTEST_DATABASE_URL unless --url is given; assertSafeTarget guards it.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { assertSafeTarget, isLocalLoadtest, loadEnvFile } from "./target.mjs";
import { PER_USER, seedPlan } from "./seedPlan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const bcrypt = require("bcryptjs");
const { ulid } = require("ulid");
const { Client } = require("pg");
const { generateSonyflake } = await import("../../lib/sonyflake.js"); // the id the app generates at sign-up

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const envFile = opt("--env");
if (!envFile) {
    console.error("usage: load:seed -- --env <file> [--url <db url>] [--users 5000] [--reset] [--yes]");
    process.exit(1);
}
const env = loadEnvFile(envFile);
const url = opt("--url") || env.LOADTEST_DATABASE_URL;
const users = Number(opt("--users") || 5000);
const password = env.LOADTEST_PASSWORD;
if (!Number.isInteger(users) || users < 1) throw new Error("--users must be a positive integer");
if (!password || password.length < 12) throw new Error(`Set LOADTEST_PASSWORD (12+ characters) in ${envFile}`);
assertSafeTarget(url, { root, confirmed: args.includes("--yes") });

const BATCH = 500;
const FREE_SEEDS = ["ai-llm-foundations", "docker-nginx-ship-a-service", "sql-data-modeling"];
const started = Date.now();
const secs = () => ((Date.now() - started) / 1000).toFixed(1);
const db = new Client({ connectionString: url });
await db.connect();
const tx = async (fn) => {
    await db.query("BEGIN");
    try {
        await fn();
        await db.query("COMMIT");
    } catch (e) {
        await db.query("ROLLBACK");
        throw e;
    }
};

try {
    console.log(`target: ${new URL(url).host}${new URL(url).pathname}`);
    const existing = (await db.query("SELECT count(*)::int AS n FROM identity.users WHERE username LIKE 'lt\\_%'")).rows[0].n;
    if (existing && !args.includes("--reset")) {
        console.error(`Refusing: ${existing} lt_ users already exist; add --reset to delete them first`);
        process.exitCode = 1;
    } else {
        if (existing) await reset(existing);
        await seed();
    }
} finally {
    await db.end();
}

async function reset(existing) {
    await tx(async () => {
        const touched = (await db.query(`SELECT DISTINCT r.course_id FROM learning.register r JOIN identity.users u ON u.id = r.user_id WHERE u.username LIKE 'lt\\_%'`)).rows.map((r) => r.course_id);
        // Conversations outlive their members, so they go first (members and messages cascade from them).
        await db.query(`DELETE FROM community.conversation WHERE id IN (
            SELECT m.conversation_id FROM community.conversation_member m JOIN identity.users u ON u.id = m.user_id WHERE u.username LIKE 'lt\\_%')`);
        await db.query("DELETE FROM identity.users WHERE username LIKE 'lt\\_%'");
        // Only the counters lt_ users moved; other courses keep their own value.
        await db.query("UPDATE catalog.course c SET students = (SELECT count(*) FROM learning.register r WHERE r.course_id = c.id) WHERE c.id = ANY($1)", [touched]);
    });
    console.log(`reset: removed ${existing} lt_ users`);
}

// register_course only takes published courses the user can open; a fresh base has none, so publish the free seeds.
async function courseIds() {
    const free = `SELECT public_id FROM catalog.course WHERE publish_status = 'published' AND access_model = 'free' AND NOT is_deleted ORDER BY public_id`;
    let rows = (await db.query(free)).rows;
    if (rows.length < PER_USER.courses) {
        if (!isLocalLoadtest(url)) throw new Error(`need ${PER_USER.courses} published free courses, found ${rows.length}`);
        for (const name of FREE_SEEDS) await db.query(fs.readFileSync(path.join(root, "db/seeds", `${name}.sql`), "utf8"));
        await db.query(`UPDATE catalog.course SET publish_status = 'published', is_hidden = false
                        WHERE access_model = 'free' AND NOT is_deleted AND publish_status = 'draft'`);
        rows = (await db.query(free)).rows;
    }
    return rows.map((r) => r.public_id);
}

// The app build prerenders roadmaps and needs at least one; same local-only gate as the course bootstrap.
async function ensureRoadmaps() {
    if ((await db.query("SELECT 1 FROM roadmap.roadmaps LIMIT 1")).rowCount || !isLocalLoadtest(url)) return;
    await db.query(fs.readFileSync(path.join(root, "db/seeds/roadmaps.sql"), "utf8"));
}

async function seed() {
    const plan = seedPlan({ users, courseIds: await courseIds(), seed: 20261113 });
    await ensureRoadmaps();
    const hash = await bcrypt.hash(password, 10);
    const ids = plan.users.map(generateSonyflake);
    const publicIds = plan.users.map(() => ulid());
    const slices = Array.from({ length: Math.ceil(users / BATCH) }, (_, b) => plan.users.slice(b * BATCH, (b + 1) * BATCH));

    for (const slice of slices) {
        await tx(async () => {
            const pick = (f) => slice.map(f);
            const uid = pick((u) => ids[u.index - 1]);
            await db.query(
                `SELECT public.sign_up(i, p, un, em, 'Load', 'Tester', $5) FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[]) AS t(i, p, un, em)`,
                [uid, pick((u) => publicIds[u.index - 1]), pick((u) => u.username), pick((u) => u.email), hash],
            );
            await db.query("UPDATE identity.users SET email_verified = true WHERE id = ANY($1::bigint[])", [uid]);
            await db.query(
                `UPDATE profile.onboarding SET status = 'completed', current_step = 'recommendations', started_at = now(), completed_at = now(), updated_at = now()
                 WHERE user_id = ANY($1::bigint[])`,
                [uid],
            );
            for (const u of slice) {
                await db.query("SELECT public.register_course($1, c) FROM unnest($2::text[]) AS c", [publicIds[u.index - 1], u.courses]);
                // First visit of each course, as the app does (learning_progress_content): register -> in_progress, first lesson unlocked.
                await db.query("SELECT public.learning_progress_content($1, c) FROM unnest($2::text[]) AS c", [publicIds[u.index - 1], u.courses]);
                await db.query(
                    `SELECT public.post_exp($1::bigint, a, 'lesson', n::bigint, NULL, 'lt:' || $3::text || ':exp:' || n)
                     FROM unnest($2::int[]) WITH ORDINALITY AS t(a, n)`,
                    [ids[u.index - 1], u.expEntries, u.username],
                );
                await db.query(
                    `SELECT public.post_points($1::bigint, 'credit', 'earned', a::bigint, 'lesson', n::bigint, 'lt:' || $3::text || ':point:' || n)
                     FROM unnest($2::int[]) WITH ORDINALITY AS t(a, n)`,
                    [ids[u.index - 1], u.pointEntries, u.username],
                );
            }
        });
        console.log(`users ${slice[0].index}-${slice.at(-1).index} done (${secs()}s)`);
    }

    // Friend and chat edges run after every user exists, since the higher index can sit in a later batch.
    for (const slice of slices) {
        await tx(async () => {
            const edges = slice.flatMap((u) => [
                ...u.friends.map((f) => [ids[u.index - 1], ids[f - 1], "accepted"]),
                ...u.pending.map((f) => [ids[u.index - 1], ids[f - 1], "pending"]),
            ]);
            await db.query(
                `INSERT INTO community.friend (sender_id, receiver_id, status)
                 SELECT s, r, st::public.status_friend_request_enum FROM unnest($1::bigint[], $2::bigint[], $3::text[]) AS t(s, r, st)`,
                [edges.map((e) => e[0]), edges.map((e) => e[1]), edges.map((e) => e[2])],
            );
            const chats = slice.flatMap((u) =>
                u.chats.map((f) => {
                    const a = BigInt(ids[u.index - 1]);
                    const b = BigInt(ids[f - 1]);
                    return { a: String(a), b: String(b), key: a < b ? `${a}:${b}` : `${b}:${a}` };
                }),
            );
            const conv = await db.query(
                `INSERT INTO community.conversation (public_id, kind, direct_key)
                 SELECT p, 'direct', k FROM unnest($1::text[], $2::text[]) AS t(p, k) RETURNING id, direct_key`,
                [chats.map(() => `cnv_${ulid().toLowerCase()}`), chats.map((c) => c.key)],
            );
            const convId = new Map(conv.rows.map((r) => [r.direct_key, r.id]));
            await db.query(
                `INSERT INTO community.conversation_member (conversation_id, user_id, state)
                 SELECT c, u, 'accepted' FROM unnest($1::bigint[], $2::bigint[]) AS t(c, u)`,
                [chats.flatMap((c) => [convId.get(c.key), convId.get(c.key)]), chats.flatMap((c) => [c.a, c.b])],
            );
            const msgs = chats.flatMap((c) =>
                Array.from({ length: PER_USER.messages }, (_, k) => ({
                    p: `msg_${ulid().toLowerCase()}`,
                    c: convId.get(c.key),
                    s: k % 2 ? c.a : c.b,
                    body: `load message ${k + 1}`,
                    age: PER_USER.messages - k,
                })),
            );
            await db.query(
                `INSERT INTO community.chat_message (public_id, conversation_id, sender_id, client_id, body, created_at)
                 SELECT p, c, s, gen_random_uuid(), b, now() - a * interval '1 minute'
                 FROM unnest($1::text[], $2::bigint[], $3::bigint[], $4::text[], $5::int[]) AS t(p, c, s, b, a)`,
                [msgs.map((m) => m.p), msgs.map((m) => m.c), msgs.map((m) => m.s), msgs.map((m) => m.body), msgs.map((m) => m.age)],
            );
            await db.query(
                `UPDATE community.conversation c SET last_message_id = m.id, last_message_at = m.created_at
                 FROM (SELECT DISTINCT ON (conversation_id) conversation_id, id, created_at FROM community.chat_message
                       WHERE conversation_id = ANY($1::bigint[]) ORDER BY conversation_id, id DESC) m
                 WHERE c.id = m.conversation_id`,
                [[...convId.values()]],
            );
        });
        console.log(`edges ${slice[0].index}-${slice.at(-1).index} done (${secs()}s)`);
    }

    const out = path.join(root, "tests/loadtest/users.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(plan.users.map((u) => ({ username: u.username, publicId: publicIds[u.index - 1] }))));

    for (const [label, from] of [
        ["users", "identity.users WHERE username LIKE 'lt\\_%'"],
        ["registrations", "learning.register"],
        ["exp entries", "profile.exp_transaction"],
        ["point entries", "profile.point_transaction"],
        ["friends", "community.friend"],
        ["conversations", "community.conversation"],
        ["chat messages", "community.chat_message"],
    ]) console.log(`${label}: ${(await db.query(`SELECT count(*)::int AS n FROM ${from}`)).rows[0].n}`);
    console.log(`wrote ${path.relative(root, out)} in ${secs()}s`);
}
