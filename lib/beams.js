import { SignJWT } from "jose";

/**
 * Pusher Beams (web push) over its REST API, server side only
 * (docs/superpowers/specs/2026-11-07-beams-web-push-design.md). Channels (lib/pusher.js) reaches
 * open tabs; Beams reaches the devices where the user turned push on.
 *
 * Every call is awaited and never throws, like `publish` in lib/pusher.js: on serverless work left
 * running after the response or Inngest step returns can be frozen, and push is only an extra on
 * top of a write that already succeeded.
 */

const MAX_USERS_PER_PUBLISH = 1000;
const MAX_USER_ID_LENGTH = 164;
const TIMEOUT_MS = 3_000;
const TIME_TO_LIVE_SEC = 86_400; // older than a day is not worth showing; the inbox keeps it
const TOKEN_LIFETIME_SEC = 86_400; // what the Node SDK issues
const CLOCK_SKEW_SEC = 300;

let warnedMissing = false;

function config() {
    const instanceId = process.env.BEAMS_INSTANCE_ID;
    const secretKey = process.env.BEAMS_SECRET_KEY;
    if (instanceId && secretKey) return { instanceId, secretKey, base: `https://${instanceId}.pushnotifications.pusher.com` };
    if (!warnedMissing) {
        console.warn("[Beams] Missing credentials (BEAMS_INSTANCE_ID, BEAMS_SECRET_KEY). Web push is skipped.");
        warnedMissing = true;
    }
    return null;
}

export function beamsConfigured() {
    return Boolean(process.env.BEAMS_INSTANCE_ID && process.env.BEAMS_SECRET_KEY);
}

async function call(cfg, path, init, label) {
    try {
        const res = await fetch(`${cfg.base}${path}`, {
            ...init,
            headers: { Authorization: `Bearer ${cfg.secretKey}`, "Content-Type": "application/json" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.ok) return true;
        console.error(`[Beams] ${label} failed with HTTP ${res.status}`);
    } catch (error) {
        console.error(`[Beams] ${label} failed:`, error?.message);
    }
    return false;
}

/** Beams Token for the Authenticated Users feature: the `{ token }` the Beams SDK reads from lib/beamsClient.js's token provider. */
export async function beamsToken(userId) {
    const cfg = config();
    if (!cfg) return null;
    // Beams rejects an `iat` ahead of its own clock ("Token used before issued"), so a machine a few
    // seconds fast fails every setUserId; dating it back absorbs that, the lifetime stays 24 h.
    const issuedAt = Math.floor(Date.now() / 1000) - CLOCK_SKEW_SEC;
    const token = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(String(userId))
        .setIssuer(cfg.base)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + TOKEN_LIFETIME_SEC)
        .sign(new TextEncoder().encode(cfg.secretKey));
    return { token };
}

/**
 * Shows `{ title, body }` on every device bound to these users (public ids); clicking opens `link`
 * (an in-site path). Not shown while a tab of the site has focus: Channels already told it.
 * @returns {Promise<boolean>} true only when every chunk was accepted
 */
export async function pushToUsers(userIds, { title, body, link = null }) {
    const users = [...new Set(userIds || [])].filter((id) => typeof id === "string" && id && id.length <= MAX_USER_ID_LENGTH);
    if (users.length === 0) return false;
    const cfg = config();
    if (!cfg) return false;

    const deepLink = new URL(link || "/notifications", process.env.NEXTAUTH_URL || "http://localhost:3000").href;
    let ok = true;
    for (let i = 0; i < users.length; i += MAX_USERS_PER_PUBLISH) {
        const payload = {
            users: users.slice(i, i + MAX_USERS_PER_PUBLISH),
            web: {
                time_to_live: TIME_TO_LIVE_SEC,
                notification: { title, body, deep_link: deepLink, hide_notification_if_site_has_focus: true },
            },
        };
        const sent = await call(cfg, `/publish_api/v1/instances/${cfg.instanceId}/publishes/users`,
            { method: "POST", body: JSON.stringify(payload) }, "publish");
        ok = ok && sent;
    }
    return ok;
}

/** Unbinds every device of a user (a session was revoked remotely). */
export async function deleteBeamsUser(userId) {
    if (!userId) return false;
    const cfg = config();
    if (!cfg) return false;
    // The Customer API path, as Beams' own end-to-end tests call it (the Node SDK's /user_api is older).
    return call(cfg, `/customer_api/v1/instances/${cfg.instanceId}/users/${encodeURIComponent(userId)}`,
        { method: "DELETE" }, "delete user");
}
