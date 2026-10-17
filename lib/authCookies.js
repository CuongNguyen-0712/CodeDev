import { cookies } from "next/headers";

import { AUTH, isSecureDeployment, refreshCookieName, sessionCookieName } from "@/lib/authConfig";
import { encodeAuthJwt } from "@/lib/authJwt";

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

export async function clearSessionCookie() {
    const store = await cookies();
    const name = sessionCookieName();
    for (const { name: cookieName } of store.getAll()) {
        if (cookieName === name || cookieName.startsWith(`${name}.`)) {
            store.set(cookieName, "", { ...sessionCookieOptions(0), maxAge: 0 });
        }
    }
}
