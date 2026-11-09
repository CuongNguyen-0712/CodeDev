import { appEnv, isDeployedEnv, isLocalUrl } from "./appEnv.mjs";
import { resolveStorageConfig, describeStorage } from "./storageConfig.mjs";
import { describeRoutes, mailRoutes } from "./mailConfig.mjs";

/**
 * Start-up sanity check of the environment split (called from instrumentation.js).
 * `fatal` = one environment wired to the other's services (stops a production server);
 * `errors` = missing configuration (logged; the affected feature fails on use).
 * Messages name variables only, never their values.
 */
export function checkEnvironment(env = process.env) {
    const environment = appEnv(env);
    const errors = [];
    const warnings = [];
    const fatal = [];

    const storage = resolveStorageConfig(env);
    errors.push(...storage.errors.map((message) => `storage: ${message}`));
    fatal.push(...storage.isolation.map((message) => `storage: ${message}`));
    warnings.push(...storage.warnings.map((message) => `storage: ${message}`));

    for (const name of ["DATABASE_URL", "NEXTAUTH_SECRET", "REFRESH_TOKEN_HASH_SECRET"]) {
        if (!env[name]) errors.push(`${name} is not set`);
    }

    // Mail: a broken route is an error in every environment (only names, never the password).
    const mail = mailRoutes(env);
    errors.push(...mail.errors.map((message) => `mail: ${message}`));
    const gmail = mail.routes.find((route) => route.mode === "gmail");
    if (gmail && !gmail.from.endsWith("@gmail.com>")) {
        warnings.push("mail: MAIL_FROM is not a gmail.com address; Gmail only sends as the signed-in account");
    }
    // Only when the password is really empty; a half-configured Gmail is already an error above.
    if (isDeployedEnv(env) && !String(env.MAIL_PASSWORD || "").trim() && mail.routes.length === 1 && mail.routes[0].mode === "agentmail") {
        warnings.push("mail: MAIL_PASSWORD is not set: no Gmail fallback when AgentMail fails");
    }

    // Media: Cloudinary only in production; every other environment uses the local Payload CMS.
    const cloudinaryNames = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
    if (environment === "production") {
        const missing = cloudinaryNames.filter((name) => !env[name]);
        if (missing.length) errors.push(`${missing.join(" / ")} not set: avatar uploads are disabled in production`);
        if (env.PAYLOAD_URL) errors.push("PAYLOAD_URL is set in production: the local CMS never backs production media");
    } else {
        if (cloudinaryNames.some((name) => env[name])) warnings.push("CLOUDINARY_* is ignored outside production (media goes to the Payload CMS)");
        if (!env.PAYLOAD_URL) warnings.push("PAYLOAD_URL is not set: uploads are disabled (start the local CMS: npm run cms:up)");
    }

    if (isDeployedEnv(env)) {
        if (env.NEXTAUTH_URL && !String(env.NEXTAUTH_URL).startsWith("https://") && !isLocalUrl(env.NEXTAUTH_URL)) {
            fatal.push("NEXTAUTH_URL must use https in production");
            errors.push("NEXTAUTH_URL must use https in production");
        }
        if (!env.REFRESH_TOKEN_RECOVERY_KEY) {
            warnings.push("REFRESH_TOKEN_RECOVERY_KEY is not set (derived from REFRESH_TOKEN_HASH_SECRET)");
        }
        if (!env.AUTH_JWT_ISSUER || !env.AUTH_JWT_AUDIENCE) {
            warnings.push("AUTH_JWT_ISSUER / AUTH_JWT_AUDIENCE use the shared defaults; give production its own values");
        }
        // Dev mode serves /api/inngest without checking signatures: anyone could run the background steps.
        if (env.INNGEST_DEV && !["0", "false"].includes(String(env.INNGEST_DEV).toLowerCase())) {
            fatal.push("INNGEST_DEV must not be set in production (it turns off Inngest request signing)");
        }
        // The admin second factor can be switched off for local development only.
        if (["0", "false", "off"].includes(String(env.ADMIN_MFA_REQUIRED ?? "").trim().toLowerCase())) {
            fatal.push("ADMIN_MFA_REQUIRED must not be off in production or staging (admin two-factor authentication)");
        }
        // An error, not fatal: without the key only the admin area fails (503), the learners' site keeps running.
        if (String(env.ADMIN_MFA_KEY || "").length < 32) {
            errors.push("ADMIN_MFA_KEY is not set or shorter than 32 characters: admin two-factor authentication answers 503");
        }
        if (env.ADMIN_IP_ALLOWLIST && !env.VERCEL && !env.CLIENT_IP_HEADER) {
            errors.push("ADMIN_IP_ALLOWLIST is set but no trusted client IP header (VERCEL or CLIENT_IP_HEADER): every admin request is refused");
        }
        if (env.INNGEST_EVENT_KEY && !env.INNGEST_SIGNING_KEY) {
            errors.push("INNGEST_SIGNING_KEY is not set: Inngest cannot call /api/inngest, background jobs will not run");
        }
        if (!env.INNGEST_EVENT_KEY) {
            warnings.push("INNGEST_EVENT_KEY is not set: background work runs inline and the daily jobs do not run");
        }
        if (!env.HEALTH_TOKEN && !env.CRON_SECRET && !env.AUTH_CRON_SECRET) {
            warnings.push("HEALTH_TOKEN is not set: GET /api/health only answers { status }, the full report is unavailable");
        }
        if (!env.SANITY_WEBHOOK_SECRET) {
            warnings.push("SANITY_WEBHOOK_SECRET is not set: published lesson edits reach learners only when the 1 h lesson cache expires");
        }
    } else if (env.DATABASE_URL && !isLocalUrl(env.DATABASE_URL)) {
        warnings.push(`${environment} is connected to a remote database`);
    }

    return { environment, storage: describeStorage(storage), mail: mail.routes.length ? describeRoutes(mail) : "not configured", fatal, errors, warnings };
}
