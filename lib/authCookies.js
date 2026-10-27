import { cookies } from "next/headers";

import { AUTH, isSecureDeployment, refreshCookieName, sessionCookieName } from "@/lib/authConfig";
import { encodeAuthJwt } from "@/lib/authJwt";
import { openRecovery, sealRecovery } from "@/lib/auth.util";

/**
 * Cookie lifecycle for route handlers (next/headers cookies() are merged into the response,
 * including next-auth's own route).
 *
 * Refresh cookie (`__Host-cd_refresh`, `cd_refresh` on plain-http dev):
 *   HttpOnly, Secure (https), Path=/, no Domain, SameSite=Strict — only our own same-site
 *   fetch to /api/auth/refresh needs it. It expires with the session's idle expiry.
 * Session cookie (next-auth's): the access state; same attributes next-auth uses.
 */

const SESSION_CHUNK_SIZE = 3936; // next-auth's chunk size (4096 - estimated cookie overhead)

export function refreshCookieOptions(expiresAtMs) {
    return {
        httpOnly: true,
        secure: isSecureDeployment(),
        sameSite: "strict",
        path: "/",
        expires: new Date(expiresAtMs),
    };
}

function sessionCookieOptions(maxAgeSec) {
    return {
        httpOnly: true,
        secure: isSecureDeployment(),
        sameSite: "lax",
        path: "/",
        expires: new Date(Date.now() + maxAgeSec * 1000),
    };
}

export async function readRefreshCookie() {
    return (await cookies()).get(refreshCookieName())?.value || null;
}

export async function setRefreshCookie(refreshToken, expiresAtMs) {
    (await cookies()).set(refreshCookieName(), refreshToken, refreshCookieOptions(expiresAtMs));
}

export async function clearRefreshCookie() {
    (await cookies()).set(refreshCookieName(), "", { ...refreshCookieOptions(0), maxAge: 0 });
}

/** Writes the session JWT the way next-auth does (chunked when larger than one cookie). */
export async function writeSessionCookie(token) {
    const store = await cookies();
    const name = sessionCookieName();
    const maxAge = AUTH.SESSION_IDLE_TTL_SEC;
    const value = await encodeAuthJwt({ token, secret: process.env.NEXTAUTH_SECRET, maxAge });

    const existing = store.getAll().map((c) => c.name).filter((n) => n === name || n.startsWith(`${name}.`));
    const chunks = value.length <= SESSION_CHUNK_SIZE
        ? [[name, value]]
        : Array.from({ length: Math.ceil(value.length / SESSION_CHUNK_SIZE) }, (_, i) => [`${name}.${i}`, value.slice(i * SESSION_CHUNK_SIZE, (i + 1) * SESSION_CHUNK_SIZE)]);

    const written = new Set(chunks.map(([n]) => n));
    for (const stale of existing) {
        if (!written.has(stale)) store.set(stale, "", { ...sessionCookieOptions(0), maxAge: 0 });
    }
    for (const [chunkName, chunkValue] of chunks) {
        store.set(chunkName, chunkValue, sessionCookieOptions(maxAge));
    }
}

/**
 * Pending OAuth link (docs/email-verification-plan.md 10.3, case 5): the provider account that
 * wants to join an existing, unverified user. AES-GCM sealed, 10 minutes, Lax so it survives the
 * redirect back from the provider.
 */
const LINK_TTL_SEC = 10 * 60;
const LINK_CONTEXT = "oauth-link|v1";
const linkCookieName = () => (isSecureDeployment() ? "__Host-cd_link" : "cd_link");

function linkCookieOptions(maxAge) {
    return { httpOnly: true, secure: isSecureDeployment(), sameSite: "lax", path: "/", maxAge };
}

/** @param {{ provider, providerAccountId, providerEmail, image, targetUserId, targetUsername, targetEmail }} link */
export async function setLinkCookie(link) {
    const value = sealRecovery(JSON.stringify({ ...link, exp: Date.now() + LINK_TTL_SEC * 1000 }), LINK_CONTEXT);
    (await cookies()).set(linkCookieName(), value, linkCookieOptions(LINK_TTL_SEC));
}

export async function readLinkCookie() {
    const sealed = (await cookies()).get(linkCookieName())?.value;
    const plain = sealed ? openRecovery(sealed, LINK_CONTEXT) : null;
    if (!plain) return null;
    try {
        const link = JSON.parse(plain);
        return link.exp > Date.now() ? link : null;
    } catch {
        return null;
    }
}

export async function clearLinkCookie() {
    (await cookies()).set(linkCookieName(), "", linkCookieOptions(0));
}

/**
 * "Connect" from Settings (plan 10.4): the signed-in user and session that started the OAuth
 * round trip, so the signIn callback links the provider to them instead of signing anyone in.
 */
const INTENT_CONTEXT = "oauth-link-intent|v1";
const intentCookieName = () => (isSecureDeployment() ? "__Host-cd_link_intent" : "cd_link_intent");

/** @param {{ userId, sessionId, provider }} intent */
export async function setLinkIntentCookie(intent) {
    const value = sealRecovery(JSON.stringify({ ...intent, exp: Date.now() + LINK_TTL_SEC * 1000 }), INTENT_CONTEXT);
    (await cookies()).set(intentCookieName(), value, linkCookieOptions(LINK_TTL_SEC));
}

export async function readLinkIntentCookie() {
    const sealed = (await cookies()).get(intentCookieName())?.value;
    const plain = sealed ? openRecovery(sealed, INTENT_CONTEXT) : null;
    if (!plain) return null;
    try {
        const intent = JSON.parse(plain);
        return intent.exp > Date.now() ? intent : null;
    } catch {
        return null;
    }
}

export async function clearLinkIntentCookie() {
    (await cookies()).set(intentCookieName(), "", linkCookieOptions(0));
}

/**
 * "Connect" hit a provider account of another user while this one is unverified (plan 12.4):
 * proof, from the OAuth round trip, that this session also controls `ownerUsername`. Only this
 * cookie unlocks "Delete and switch", so a crafted Settings link cannot offer it.
 */
const CONFLICT_CONTEXT = "oauth-link-conflict|v1";
const conflictCookieName = () => (isSecureDeployment() ? "__Host-cd_link_conflict" : "cd_link_conflict");

/** @param {{ userId, sessionId, provider, ownerUsername, deletable, purgeAfter }} conflict */
export async function setLinkConflictCookie(conflict) {
    const value = sealRecovery(JSON.stringify({ ...conflict, exp: Date.now() + LINK_TTL_SEC * 1000 }), CONFLICT_CONTEXT);
    (await cookies()).set(conflictCookieName(), value, linkCookieOptions(LINK_TTL_SEC));
}

export async function readLinkConflictCookie() {
    const sealed = (await cookies()).get(conflictCookieName())?.value;
    const plain = sealed ? openRecovery(sealed, CONFLICT_CONTEXT) : null;
    if (!plain) return null;
    try {
        const conflict = JSON.parse(plain);
        return conflict.exp > Date.now() ? conflict : null;
    } catch {
        return null;
    }
}

export async function clearLinkConflictCookie() {
    (await cookies()).set(conflictCookieName(), "", linkCookieOptions(0));
}

export async function clearSessionCookie() {
    const store = await cookies();
    const name = sessionCookieName();
    for (const { name: cookieName } of store.getAll()) {
        if (cookieName === name || cookieName.startsWith(`${name}.`)) {
            store.set(cookieName, "", { ...sessionCookieOptions(0), maxAge: 0 });
        }
    }
}
