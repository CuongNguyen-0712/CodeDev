import { isDeployedEnv } from "./appEnv.mjs";

/**
 * Where outgoing mail goes (docs/auth.md, "Email"). Plain ESM with no dependencies, shared by
 * lib/mail.js, the start-up check (lib/envCheck.mjs) and scripts/mail-test.mjs.
 *
 * Routes, tried in this order by lib/mail.js (any error on one moves to the next):
 *   AgentMail  AGENTMAIL_API_KEY + AGENTMAIL_FROM (the inbox, "CodeDev <codedev@agentmail.to>"),
 *              optional AGENTMAIL_HOST (default smtp.agentmail.to); port 465, implicit TLS.
 *   Gmail      MAIL_FROM ("you@gmail.com" or "CodeDev <you@gmail.com>") + MAIL_PASSWORD (its Google
 *              App Password; spaces are ignored) -> smtp.gmail.com:465. Optional MAIL_HOST / MAIL_PORT
 *              replace smtp.gmail.com:465 (another SMTP provider).
 * Neither, dev / test -> Mailpit from compose.yml (127.0.0.1:1025, inbox http://127.0.0.1:8025).
 * Neither, production -> { error }: nothing is sent, the auth outbox keeps retrying.
 * Mailpit is never a fallback for AgentMail.
 */

export const AGENTMAIL_SERVER = { host: "smtp.agentmail.to", port: 465 };
export const GMAIL_SERVER = { host: "smtp.gmail.com", port: 465 };
export const MAILPIT_SERVER = { host: "127.0.0.1", port: 1025 };
const SENDER_NAME = "CodeDev";
const DEV_SENDER = "dev@codedev.local";

/** "you@gmail.com" | "Name <you@gmail.com>" -> { name, address } (address in lower case), or null. */
export function parseMailFrom(value) {
    const raw = String(value || "").trim();
    const named = raw.match(/^(.*?)\s*<([^<>\s]+@[^<>\s]+\.[^<>\s]+)>$/);
    if (named) return { name: named[1].replace(/^"|"$/g, "").trim() || SENDER_NAME, address: named[2].toLowerCase() };
    return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(raw) ? { name: SENDER_NAME, address: raw.toLowerCase() } : null;
}

/**
 * The Gmail / SMTP route (or Mailpit).
 * @returns {{ mode: "gmail" | "smtp" | "mailpit", host: string, port: number, secure: boolean,
 *             auth: { user: string, pass: string } | null, from: string } | { error: string }}
 */
export function mailConfig(env = process.env) {
    const from = parseMailFrom(env.MAIL_FROM);
    const password = String(env.MAIL_PASSWORD || "").replace(/\s+/g, "");
    const custom = env.MAIL_HOST ? { host: String(env.MAIL_HOST).trim(), port: Number(env.MAIL_PORT) || 465 } : null;

    if (env.MAIL_FROM && !from) return { error: "MAIL_FROM is not an email address (you@gmail.com or Name <you@gmail.com>)" };

    if (password) {
        if (!from) return { error: "MAIL_FROM (the sending address) is required with MAIL_PASSWORD" };
        const server = custom || GMAIL_SERVER;
        return {
            mode: custom ? "smtp" : "gmail",
            ...server,
            secure: server.port === 465,
            auth: { user: from.address, pass: password },
            from: `${from.name} <${from.address}>`,
        };
    }

    if (isDeployedEnv(env)) return { error: "MAIL_FROM / MAIL_PASSWORD (or AGENTMAIL_API_KEY + AGENTMAIL_FROM) are not set: no email can be sent" };

    const server = custom || MAILPIT_SERVER;
    return {
        mode: custom ? "smtp" : "mailpit",
        ...server,
        secure: false,
        auth: null,
        from: `${from?.name || SENDER_NAME} <${from?.address || DEV_SENDER}>`,
    };
}

/**
 * The AgentMail route: null when AGENTMAIL_API_KEY is empty, else the config or { error }.
 * @returns {{ mode: "agentmail", host: string, port: number, secure: true, auth: { user: string, pass: string }, from: string } | { error: string } | null}
 */
export function agentmailConfig(env = process.env) {
    // Trimmed: a key pasted into a dashboard often carries a trailing newline.
    const key = String(env.AGENTMAIL_API_KEY || "").trim();
    if (!key) return null;
    const from = parseMailFrom(env.AGENTMAIL_FROM);
    if (!from) return { error: "AGENTMAIL_FROM (the AgentMail inbox, e.g. CodeDev <codedev@agentmail.to>) is required with AGENTMAIL_API_KEY" };
    return {
        mode: "agentmail",
        host: String(env.AGENTMAIL_HOST || "").trim() || AGENTMAIL_SERVER.host,
        port: AGENTMAIL_SERVER.port,
        secure: true,
        auth: { user: from.address, pass: key },
        from: `${from.name} <${from.address}>`,
    };
}

/**
 * Every usable route in the order lib/mail.js tries them, and the configuration errors of the others.
 * @returns {{ routes: object[], errors: string[] }}
 */
export function mailRoutes(env = process.env) {
    const routes = [];
    const errors = [];
    const agentmail = agentmailConfig(env);
    if (agentmail?.error) errors.push(agentmail.error);
    else if (agentmail) routes.push(agentmail);

    // Gmail / SMTP backs AgentMail up only when it has a password: Mailpit never stands in for it.
    if (!routes.length || String(env.MAIL_PASSWORD || "").trim()) {
        const smtp = mailConfig(env);
        if (smtp.error) errors.push(smtp.error);
        else routes.push(smtp);
    }
    return { routes, errors };
}

/** Same as mailConfig, without the password: safe to log. */
export function describeMail(config) {
    if (config.error) return `not configured (${config.error})`;
    return `${config.mode} ${config.host}:${config.port} from ${config.from}`;
}

/** mailRoutes without secrets: "agentmail … -> fallback gmail …", or "not configured (…)". */
export function describeRoutes({ routes, errors }) {
    if (!routes.length) return `not configured (${errors.join("; ")})`;
    return routes.map(describeMail).join(" -> fallback ");
}
