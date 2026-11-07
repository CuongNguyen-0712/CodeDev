import nodemailer from "nodemailer";

// Relative, not "@/": scripts/mail-test.mjs imports this file with plain node.
import { describeMail, describeRoutes, mailRoutes } from "./mailConfig.mjs";

/**
 * Outgoing mail over SMTP. Routes (lib/mailConfig.mjs): AgentMail (AGENTMAIL_API_KEY +
 * AGENTMAIL_FROM) first, Gmail (MAIL_FROM + MAIL_PASSWORD) as its fallback, or Mailpit in
 * development when neither is set. Any error on one route (limit, auth, network, timeout) moves
 * the same send to the next route.
 *
 * Every caller sends from the auth outbox, which retries a failed send with backoff, so this only
 * has to fail fast: short timeouts keep a slow or unreachable SMTP server from holding the
 * request (sign-in callbacks wait for their notice mail).
 */

const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

// One transport per server and account, so alternating routes do not rebuild them.
const transports = new Map();

function transporter(config) {
    const key = `${config.host}:${config.port}:${config.auth?.user || ""}:${config.auth?.pass || ""}`;
    if (!transports.has(key)) {
        transports.set(key, nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: config.auth || undefined,
            ...TIMEOUTS,
        }));
    }
    return transports.get(key);
}

// Names the server, never the password. Mailpit not running is the usual local cause.
function describeFailure(config, error) {
    const hint = config.mode === "mailpit" ? " (is Mailpit running? npm run services:up)" : "";
    return `${describeMail(config)}: ${error?.message}${hint}`;
}

/** @returns {Promise<string>} the message id. Throws when no route could hand the mail over. */
export async function sendMail({ to, subject, html, text }) {
    const { routes, errors } = mailRoutes();
    if (!routes.length) throw new Error(`[mail] ${errors.join("; ")}`);

    const failures = [];
    for (const [index, config] of routes.entries()) {
        try {
            const info = await transporter(config).sendMail({ from: config.from, to, subject, html, text });
            return info.messageId;
        } catch (error) {
            failures.push(describeFailure(config, error));
            const next = routes[index + 1];
            if (next) console.warn(`[mail] ${config.mode} failed, trying ${next.mode}: ${error?.message}`);
        }
    }
    throw new Error(`[mail] ${failures.join("; ")}`);
}

/** Opens a connection and authenticates on every route without sending anything (scripts/mail-test.mjs). */
export async function verifyMail() {
    const setup = mailRoutes();
    if (!setup.routes.length) throw new Error(`[mail] ${setup.errors.join("; ")}`);
    for (const config of setup.routes) {
        try {
            await transporter(config).verify();
        } catch (error) {
            throw new Error(`[mail] ${describeFailure(config, error)}`);
        }
    }
    return describeRoutes(setup);
}
