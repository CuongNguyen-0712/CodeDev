import nodemailer from "nodemailer";

/**
 * Outgoing mail over SMTP (docs/email-verification-plan.md section 2). Two ways to configure it:
 *   - EMAIL_USER + EMAIL_PASS: a Gmail address and its App Password (production today);
 *     smtp.gmail.com:465 is implied.
 *   - SMTP_HOST, SMTP_PORT (465 = implicit TLS, otherwise STARTTLS when offered), SMTP_USER,
 *     SMTP_PASS: any other server (Mailpit in development, Resend once there is a domain).
 *     SMTP_HOST wins when both are set.
 * MAIL_FROM is optional; it defaults to "CodeDev <the sending address>" (Gmail rewrites any other
 * From to the account anyway). Without either, development and tests log the message instead;
 * production throws so the outbox retries and the failure shows up in the logs.
 */

export function mailConfig(env = process.env) {
    if (env.SMTP_HOST) {
        const port = Number(env.SMTP_PORT) || 465;
        const user = env.SMTP_USER || null;
        return { host: env.SMTP_HOST, port, user, pass: env.SMTP_PASS || "", from: env.MAIL_FROM || (user?.includes("@") ? `CodeDev <${user}>` : "CodeDev <no-reply@codedev.local>") };
    }
    if (env.EMAIL_USER && env.EMAIL_PASS) {
        return { host: "smtp.gmail.com", port: 465, user: env.EMAIL_USER, pass: env.EMAIL_PASS, from: env.MAIL_FROM || `CodeDev <${env.EMAIL_USER}>` };
    }
    return null;
}

let transport = null;

function transporter(config) {
    if (transport) return transport;
    transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
    return transport;
}

export async function sendMail({ to, subject, html, text }) {
    const config = mailConfig();
    if (!config) {
        if (process.env.NODE_ENV === "production") throw new Error("Mail is not configured (EMAIL_USER / EMAIL_PASS or SMTP_HOST): cannot send email");
        console.info(`[mail] no mail server configured, not sent. to=${to} subject=${subject}\n${text}`);
        return;
    }

    await transporter(config).sendMail({ from: config.from, to, subject, html, text });
}
