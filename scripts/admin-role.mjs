#!/usr/bin/env node
/**
 * Roles from the command line (docs/admin-panel-plan.md 3.5): the only way to make the first
 * super admin, and the way back when nobody can sign in to the admin area any more.
 *
 *   npm run admin:role -- list <email>
 *   npm run admin:role -- grant <email> <role> --reason "<why>"
 *   npm run admin:role -- revoke <email> <role> --reason "<why>"
 *   npm run admin:role -- reset-mfa <email> --reason "<why>"   lost authenticator: enrol again at the next admin visit
 *   --env .env.production               another env file (default .env.local)
 *
 * Every change writes identity.audit_log with actor_id NULL and a reason starting with "cli:".
 * Revoking refuses to remove the last active super_admin.
 */
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const dotenv = require("dotenv");
const { Client } = require("pg");

const args = process.argv.slice(2);
const take = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args.splice(index, 2)[1] : null;
};
const envFile = take("--env");
const reason = take("--reason");
dotenv.config({ path: path.resolve(root, envFile || ".env.local"), quiet: true, override: true });
// Shared values (.env) under the env file above, the order Next.js uses.
dotenv.config({ path: path.resolve(root, ".env"), quiet: true });
const [command, email, roleCode] = args;

const usage = () => {
    console.error("usage: admin:role -- list <email> | grant|revoke <email> <role> --reason <why> | reset-mfa <email> --reason <why> [--env <file>]");
    process.exit(1);
};
if (!["list", "grant", "revoke", "reset-mfa"].includes(command) || !email) usage();
if (["grant", "revoke"].includes(command) && !roleCode) usage();
if (command !== "list" && (!reason || reason.trim().length < 5)) usage();
if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
}

const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const one = async (text, params) => (await db.query(text, params)).rows[0];

const rolesOf = async (userId) =>
    (await db.query(
        `SELECT r.code FROM identity.user_roles ur JOIN identity.roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1 ORDER BY r.rank DESC, r.code`,
        [userId]
    )).rows.map((row) => row.code);

try {
    const target = new URL(process.env.DATABASE_URL).hostname;
    console.log(`target: ${target}`);

    const user = await one(`SELECT id::text, public_id, username, status FROM identity.users WHERE lower(email) = lower($1)`, [email]);
    if (!user) throw new Error(`No user with email ${email}`);

    if (command === "reset-mfa") {
        await db.query("BEGIN");
        await db.query(`DELETE FROM identity.admin_mfa WHERE user_id = $1`, [user.id]);
        await db.query(`DELETE FROM identity.admin_mfa_recovery WHERE user_id = $1`, [user.id]);
        await db.query(`UPDATE identity.sessions SET mfa_verified_at = NULL, reauth_at = NULL WHERE user_id = $1`, [user.id]);
        await db.query(
            `INSERT INTO identity.audit_log (actor_id, action, target_type, target_id, reason) VALUES (NULL, 'mfa.reset', 'user', $1, $2)`,
            [user.public_id, `cli: ${reason.trim()}`]
        );
        await db.query("COMMIT");
        console.log(`${user.username}: two-factor removed; they set it up again at the next admin visit.`);
    } else if (command === "list") {
        console.log(`${user.username} (${user.public_id}, ${user.status}): ${(await rolesOf(user.id)).join(", ") || "no roles"}`);
    } else {
        await db.query("BEGIN");
        const role = await one(`SELECT id, code FROM identity.roles WHERE code = $1`, [roleCode]);
        if (!role) throw new Error(`Unknown role ${roleCode}`);
        const before = await rolesOf(user.id);

        if (command === "grant") {
            await db.query(`INSERT INTO identity.user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.id, role.id]);
        } else {
            if (role.code === "super_admin") {
                // Lock every super admin row so two revokes cannot both pass the check.
                const { rows } = await db.query(
                    `SELECT u.id FROM identity.users u
                     JOIN identity.user_roles ur ON ur.user_id = u.id
                     JOIN identity.roles r ON r.id = ur.role_id AND r.code = 'super_admin'
                     WHERE u.status = 'active'
                     FOR UPDATE OF u`
                );
                if (rows.length <= 1 && rows.some((row) => String(row.id) === user.id)) {
                    throw new Error("Refusing to remove the last active super_admin");
                }
            }
            await db.query(`DELETE FROM identity.user_roles WHERE user_id = $1 AND role_id = $2`, [user.id, role.id]);
        }

        const after = await rolesOf(user.id);
        await db.query(
            `INSERT INTO identity.audit_log (actor_id, action, target_type, target_id, reason, before, after)
             VALUES (NULL, $1, 'user', $2, $3, $4, $5)`,
            [command === "grant" ? "role.grant" : "role.revoke", user.public_id, `cli: ${reason.trim()}`,
                JSON.stringify({ roles: before }), JSON.stringify({ roles: after })]
        );
        await db.query("COMMIT");
        console.log(`${user.username}: ${before.join(", ") || "no roles"} -> ${after.join(", ") || "no roles"}`);
        console.log("Sessions keep working; the new roles apply on the next request (read from the database).");
    }
} catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await db.end();
}
