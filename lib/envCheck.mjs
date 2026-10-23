import { appEnv, isLocalUrl } from "./appEnv.mjs";
import { resolveStorageConfig, describeStorage } from "./storageConfig.mjs";
import { describeMail, mailConfig } from "./mailConfig.mjs";

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

    // Mail: a broken config is an error in every environment (only names, never the password).
    const mail = mailConfig(env);
    if (mail.error) errors.push(`mail: ${mail.error}`);
    else if (mail.mode === "gmail" && !mail.from.endsWith("@gmail.com>")) {
        warnings.push("mail: MAIL_FROM is not a gmail.com address; Gmail only sends as the signed-in account");
    }

    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
        warnings.push("CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET are not set: avatar uploads are disabled");
    }

    if (environment === "production") {
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
    } else if (env.DATABASE_URL && !isLocalUrl(env.DATABASE_URL)) {
        warnings.push(`${environment} is connected to a remote database`);
    }

    return { environment, storage: describeStorage(storage), mail: mail.error ? "not configured" : describeMail(mail), fatal, errors, warnings };
}
