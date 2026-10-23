import nodemailer from "nodemailer";

// Relative, not "@/": scripts/mail-test.mjs imports this file with plain node.
import { describeMail, mailConfig } from "./mailConfig.mjs";

/**
 * Outgoing mail over SMTP. Configuration: MAIL_FROM + MAIL_PASSWORD (Gmail App Password), or
 * Mailpit in development when no password is set; see lib/mailConfig.mjs.
 *
 * Every caller sends from the auth outbox, which retries a failed send with backoff, so this only
 * has to fail fast: short timeouts keep a slow or unreachable SMTP server from holding the
 * request (sign-in callbacks wait for their notice mail).
 */

const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

let cached = null;

function transporter(config) {
    const key = `${config.host}:${config.port}:${config.auth?.user || ""}:${config.auth?.pass || ""}`;
    if (cached?.key !== key) {
        cached = {
            key,
            transport: nodemailer.createTransport({
                host: config.host,
                port: config.port,
                secure: config.secure,
                auth: config.auth || undefined,
                ...TIMEOUTS,
            }),
        };
    }
    return cached.transport;
}

/** @returns {Promise<string>} the message id. Throws when the mail could not be handed over. */
export async function sendMail({ to, subject, html, text }) {
    const config = mailConfig();
    if (config.error) throw new Error(`[mail] ${config.error}`);

    try {
        const info = await transporter(config).sendMail({ from: config.from, to, subject, html, text });
        return info.messageId;
    } catch (error) {
        // Names the server, never the password. Mailpit not running is the usual local cause.
        const hint = config.mode === "mailpit" ? " (is Mailpit running? npm run services:up)" : "";
        throw new Error(`[mail] ${describeMail(config)}: ${error?.message}${hint}`);
    }
}

/** Opens a connection and authenticates without sending anything (scripts/mail-test.mjs). */
export async function verifyMail() {
    const config = mailConfig();
    if (config.error) throw new Error(`[mail] ${config.error}`);
    await transporter(config).verify();
    return describeMail(config);
}
