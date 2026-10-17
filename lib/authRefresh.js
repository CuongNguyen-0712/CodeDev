import { TERMINAL_REFRESH_ERRORS } from "@/constants/auth";

/**
 * Browser-side session refresh (POST /api/auth/refresh).
 *
 *   - single-flight: concurrent callers in a tab share one refresh promise;
 *   - cross-tab: a Web Lock serialises refreshes between tabs and every tab hears the result on a
 *     BroadcastChannel, so a tab that waited for the lock skips its own refresh when another tab
 *     already did it (the refresh cookie is shared, so a second rotation would only replay);
 *   - one Idempotency-Key per refresh operation, reused for its retries (timeouts, network
 *     errors, 5xx): if the server committed but the response was lost, the retry gets the same
 *     token back instead of being treated as a replay;
 *   - terminal failures (revoked / expired / reused session) are broadcast as `signed-out`.
 * Tokens never pass through JavaScript: both cookies are HttpOnly.
 */

const CHANNEL_NAME = "cd-auth";
const LOCK_NAME = "cd-auth-refresh";
// Refresh proactively this long before the access state ends.
export const REFRESH_MARGIN_MS = 60_000;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;

const state = {
    accessExpiresAt: 0,
    lastRefreshAt: 0,
    inflight: null,
    channel: null,
    listeners: new Set(),
};

export class AuthRefreshError extends Error {
    constructor(message, { status = 0, code = null, terminal = false } = {}) {
        super(message);
        this.name = "AuthRefreshError";
        this.status = status;
        this.code = code;
        this.terminal = terminal;
    }
}

const isBrowser = () => typeof window !== "undefined";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function deliver(message, local) {
    if (message?.type === "refreshed") {
        state.accessExpiresAt = Math.max(state.accessExpiresAt, Number(message.accessExpiresAt) || 0);
        state.lastRefreshAt = Math.max(state.lastRefreshAt, Number(message.at) || 0);
    }
    if (message?.type === "signed-out") {
        state.accessExpiresAt = 0;
    }
    state.listeners.forEach((listener) => {
        try {
            listener(message, { local });
        } catch (error) {
            console.error("[auth] listener failed:", error);
        }
    });
}

function getChannel() {
    if (!isBrowser() || typeof BroadcastChannel === "undefined") return null;
    if (!state.channel) {
        state.channel = new BroadcastChannel(CHANNEL_NAME);
        state.channel.onmessage = (event) => deliver(event.data, false);
    }
    return state.channel;
}

function broadcast(message) {
    deliver(message, true);
    getChannel()?.postMessage(message);
}

/** Subscribe to `{ type: "refreshed" | "signed-out", ... }` from this and other tabs. */
export function onAuthEvent(listener) {
    getChannel();
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
}

/** Expiry reported by the server (useSession). Never lowers a value another tab already raised. */
export function setKnownAccessExpiry(accessExpiresAt) {
    const value = Number(accessExpiresAt) || 0;
    if (value > state.accessExpiresAt) state.accessExpiresAt = value;
}

export const getKnownAccessExpiry = () => state.accessExpiresAt;

export function resetAuthRefreshState() {
    state.accessExpiresAt = 0;
    state.lastRefreshAt = 0;
}

function newIdempotencyKey() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function withLock(task) {
    if (isBrowser() && navigator.locks?.request) {
        return navigator.locks.request(LOCK_NAME, { mode: "exclusive" }, task);
    }
    return task();
}

async function performRefresh() {
    const idempotencyKey = newIdempotencyKey();
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let response;
        try {
            response = await fetch("/api/auth/refresh", {
                method: "POST",
                credentials: "same-origin",
                cache: "no-store",
                headers: { "Idempotency-Key": idempotencyKey },
                signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined,
            });
        } catch (error) {
            // Network error or timeout: the server may still have committed — retry, same key.
            lastError = new AuthRefreshError("Could not reach the server to refresh the session.", { status: 0 });
            if (attempt < MAX_ATTEMPTS) await sleep(300 * 2 ** (attempt - 1));
            continue;
        }

        const body = await response.json().catch(() => ({}));

        if (response.ok) {
            const accessExpiresAt = Number(body?.data?.accessExpiresAt) || 0;
            const at = Date.now();
            state.accessExpiresAt = accessExpiresAt;
            state.lastRefreshAt = at;
            broadcast({ type: "refreshed", accessExpiresAt, at });
            return { refreshed: true, accessExpiresAt };
        }

        const code = body?.code || null;

        if (response.status >= 500 || response.status === 429 || response.status === 408) {
            lastError = new AuthRefreshError(body?.message || "Session refresh failed.", { status: response.status, code });
            const retryAfter = Number(response.headers.get("retry-after")) || 0;
            if (attempt < MAX_ATTEMPTS) await sleep(retryAfter ? retryAfter * 1000 : 300 * 2 ** (attempt - 1));
            continue;
        }

        const terminal = response.status === 401 && (!code || TERMINAL_REFRESH_ERRORS.includes(code));
        const error = new AuthRefreshError(body?.message || "Session refresh failed.", { status: response.status, code, terminal });
        if (terminal) broadcast({ type: "signed-out", code, at: Date.now() });
        throw error;
    }

    throw lastError || new AuthRefreshError("Session refresh failed.");
}

/**
 * Refreshes the access state unless it is not needed:
 *   - `ifOlderThan` (ms, e.g. when a request that got 401 ACCESS_TOKEN_EXPIRED started): skip
 *     when a refresh completed after that moment — the cookie the retry will send is already new;
 *   - otherwise skip while the known access expiry is more than REFRESH_MARGIN_MS away.
 * `force` always refreshes.
 */
export function refreshSession({ ifOlderThan = 0, force = false } = {}) {
    if (!isBrowser()) {
        return Promise.reject(new AuthRefreshError("Session refresh only runs in the browser."));
    }

    if (state.inflight) return state.inflight;

    state.inflight = withLock(async () => {
        const upToDate = ifOlderThan
            ? state.lastRefreshAt > ifOlderThan
            : state.accessExpiresAt - Date.now() > REFRESH_MARGIN_MS;

        if (!force && upToDate) {
            return { refreshed: false, accessExpiresAt: state.accessExpiresAt };
        }

        return performRefresh();
    }).finally(() => {
        state.inflight = null;
    });

    return state.inflight;
}
