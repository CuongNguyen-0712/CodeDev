#!/usr/bin/env node
/**
 * Checks the mail configuration of an env file (lib/mailConfig.mjs) without starting the app:
 * prints where mail goes, signs in to the SMTP server, and optionally sends one test message.
 *
 * Usage:
 *   node scripts/mail-test.mjs                                  # .env.local (Mailpit, or Gmail when MAIL_PASSWORD is set)
 *   node scripts/mail-test.mjs --to you@example.com             # also send a test message
 *   node scripts/mail-test.mjs --env .env.production --to you@example.com
 *
 * Never prints MAIL_PASSWORD. Exit code 1 when the configuration is missing or the server refuses.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const envFile = option("--env", ".env.local");
const to = option("--to");

dotenv.config({ path: path.resolve(root, envFile), quiet: true, override: true });

const { mailConfig, describeMail } = await import("../lib/mailConfig.mjs");
const { sendMail, verifyMail } = await import("../lib/mail.js");

const config = mailConfig();
console.log(`env:  ${envFile}`);
console.log(`mail: ${describeMail(config)}`);
if (config.error) process.exit(1);

try {
    await verifyMail();
    console.log("smtp: connected and signed in");

    if (to) {
        const id = await sendMail({
            to,
            subject: "CodeDev mail test",
            text: `Test message from scripts/mail-test.mjs (${envFile}, ${new Date().toISOString()}).`,
            html: `<p>Test message from <code>scripts/mail-test.mjs</code> (${envFile}, ${new Date().toISOString()}).</p>`,
        });
        console.log(`sent: ${id} -> ${to}${config.mode === "mailpit" ? " (inbox http://127.0.0.1:8025)" : ""}`);
    }
} catch (error) {
    console.error(`fail: ${error?.message}`);
    process.exit(1);
}
