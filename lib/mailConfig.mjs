import { appEnv } from "./appEnv.mjs";

/**
 * Where outgoing mail goes (docs/auth.md, "Email"). Plain ESM with no dependencies, shared by
 * lib/mail.js, the start-up check (lib/envCheck.mjs) and scripts/mail-test.mjs.
 *
 *   MAIL_FROM      the sending Gmail address: "you@gmail.com" or "CodeDev <you@gmail.com>"
 *   MAIL_PASSWORD  that account's Google App Password (16 letters; spaces are ignored)
 *
 * MAIL_PASSWORD set   -> smtp.gmail.com:465 (implicit TLS), signed in as MAIL_FROM, any environment.
 * not set, dev / test -> Mailpit from compose.yml (127.0.0.1:1025, inbox http://127.0.0.1:8025).
 * not set, production -> { error }: nothing is sent, the auth outbox keeps retrying.
 * Optional MAIL_HOST / MAIL_PORT replace smtp.gmail.com:465 (another provider, e.g. Resend).
 */

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

    if (appEnv(env) === "production") return { error: "MAIL_FROM / MAIL_PASSWORD are not set: no email can be sent" };

    const server = custom || MAILPIT_SERVER;
    return {
        mode: custom ? "smtp" : "mailpit",
        ...server,
        secure: false,
        auth: null,
        from: `${from?.name || SENDER_NAME} <${from?.address || DEV_SENDER}>`,
    };
}

/** Same as mailConfig, without the password: safe to log. */
export function describeMail(config) {
    if (config.error) return `not configured (${config.error})`;
    return `${config.mode} ${config.host}:${config.port} from ${config.from}`;
}
