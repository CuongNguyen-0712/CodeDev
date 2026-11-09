import { appEnv } from "../appEnv.mjs";

/**
 * Origins lesson media may load from: Cloudinary always, the local Payload CMS outside production.
 * Plain ESM so next.config.js (build time) and the renderer (via NEXT_PUBLIC_MEDIA_ORIGINS) share it.
 */
export function mediaOrigins(env = process.env) {
    const origins = ["https://res.cloudinary.com"];
    if (appEnv(env) !== "production" && env.PAYLOAD_URL) {
        try {
            origins.push(new URL(env.PAYLOAD_URL).origin);
        } catch {
            // Invalid PAYLOAD_URL: no local origin.
        }
    }
    return origins;
}

/** Exact origin match (never a prefix match); false for anything that does not parse. */
export function isAllowedMediaUrl(url, origins) {
    try {
        return origins.includes(new URL(url).origin);
    } catch {
        return false;
    }
}
