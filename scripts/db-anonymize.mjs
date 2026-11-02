#!/usr/bin/env node
/**
 * Anonymises a copy of production for staging (docs/admin-panel-plan.md 2.3). Run it right after
 * "Reset from parent" of the Neon branch `staging`, before any preview deployment uses it.
 *
 *   npm run db:anonymize -- --env .env.staging --yes
 *
 * In one transaction:
 *   - email -> user<id>@staging.codedev.test, username -> user<id>, names / phone / bio / avatar cleared;
 *   - every account signs in with the shared password STAGING_PASSWORD (from the env file);
 *     OAuth links are removed (they point at real Google / GitHub accounts);
 *   - sessions, refresh tokens, email tokens, the auth outbox and dead letters are deleted;
 *   - private messages and feedback text are replaced, audit_log IP addresses cleared.
 * Refuses to run against the database of .env.production, and against any non-local database
 * without --yes.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const envFile = envIndex >= 0 ? args[envIndex + 1] : null;
const confirmed = args.includes("--yes");
if (!envFile) {
    console.error("usage: db:anonymize -- --env <file> [--yes]");
    process.exit(1);
}

const targetEnv = dotenv.parse(fs.readFileSync(path.resolve(root, envFile)));
const productionFile = path.resolve(root, ".env.production");
const productionEnv = fs.existsSync(productionFile) ? dotenv.parse(fs.readFileSync(productionFile)) : {};

const hostOf = (url) => {
    try {
        return new URL(url).hostname.replace(/-pooler(?=\.)/, "");
    } catch {
        return null;
    }
};
const target = hostOf(targetEnv.DATABASE_URL);
const LOCAL = new Set(["localhost", "127.0.0.1", "::1"]);

if (!target) {
    console.error(`DATABASE_URL is not set in ${envFile}`);
    process.exit(1);
}
if (productionEnv.DATABASE_URL && hostOf(productionEnv.DATABASE_URL) === target) {
    console.error("Refusing: this is the production database (same host as .env.production)");
    process.exit(1);
}
if (!LOCAL.has(target) && !confirmed) {
    console.error(`Refusing: ${target} is not local; add --yes once you are sure it is the staging copy`);
    process.exit(1);
}
const password = targetEnv.STAGING_PASSWORD;
if (!password || password.length < 12) {
    console.error(`Set STAGING_PASSWORD (12+ characters) in ${envFile}: the shared sign-in password of staging`);
    process.exit(1);
}

const db = new Client({ connectionString: targetEnv.DATABASE_URL });
await db.connect();
const run = async (label, text, params) => {
    const { rowCount } = await db.query(text, params);
    console.log(`${label}: ${rowCount}`);
};

try {
    console.log(`target: ${target}`);
    await db.query("BEGIN");

    await run("users", `UPDATE identity.users SET email = 'user' || id || '@staging.codedev.test', username = 'user' || id, updated_at = now()`);
    await run("profiles", `UPDATE profile.info SET surname = 'Learner', name = user_id::text, nickname = NULL, phone = NULL, bio = NULL, image = NULL, avatar_asset_id = NULL`);

    await run("oauth links removed", `DELETE FROM identity.accounts WHERE provider IS DISTINCT FROM 'credentials'`);
    const hash = await bcrypt.hash(password, 10);
    await run("passwords reset", `UPDATE identity.accounts SET password_hash = $1, provider_email = NULL WHERE provider = 'credentials'`, [hash]);
    await run("password accounts added", `
        INSERT INTO identity.accounts (user_id, password_hash, provider)
        SELECT u.id, $1, 'credentials' FROM identity.users u
        WHERE NOT EXISTS (SELECT 1 FROM identity.accounts a WHERE a.user_id = u.id AND a.provider = 'credentials')`, [hash]);

    // Production TOTP secrets and recovery codes: staging admins enrol again with staging's own key.
    await run("admin two-factor recovery codes", `DELETE FROM identity.admin_mfa_recovery`);
    await run("admin two-factor", `DELETE FROM identity.admin_mfa`);
    await run("refresh tokens", `DELETE FROM identity.refresh_tokens`);
    await run("sessions", `DELETE FROM identity.sessions`);
    await run("email tokens", `DELETE FROM identity.email_tokens`);
    await run("auth outbox", `DELETE FROM identity.auth_outbox`);
    await run("dead letters", `DELETE FROM ops.dead_letters`);

    await run("messages", `UPDATE community.messages SET message = '[removed on staging]'`);
    await run("feedback", `UPDATE community.feedback SET feedback = '[removed on staging]'`);

    // audit_log is append-only (trigger); the table owner lifts it for this one update.
    await db.query(`ALTER TABLE identity.audit_log DISABLE TRIGGER trg_audit_log_append_only`);
    await run("audit IP addresses", `UPDATE identity.audit_log SET ip_address = NULL WHERE ip_address IS NOT NULL`);
    await db.query(`ALTER TABLE identity.audit_log ENABLE TRIGGER trg_audit_log_append_only`);

    const left = (await db.query(`SELECT count(*)::int AS n FROM identity.users WHERE email NOT LIKE '%@staging.codedev.test'`)).rows[0].n;
    if (left !== 0) throw new Error(`${left} users still have a real email`);

    await db.query("COMMIT");
    console.log("done: every account signs in with STAGING_PASSWORD");
} catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await db.end();
}
