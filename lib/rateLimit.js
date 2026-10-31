import { NextResponse } from "next/server.js";

import { redis } from "./cache.js";

/**
 * Sliding-window rate limiter backed by Redis (atomic Lua), with a per-instance in-memory
 * fallback while Redis is unreachable — so limits keep working (per node) during an outage
 * instead of failing open.
 *
 * Keys: `rl:{prefix}:{identifier}:{bucket}`. Denied requests are not counted.
 * Response headers follow the IETF draft (`RateLimit-*`) plus the legacy `X-RateLimit-*`.
 */
export class RateLimiter {
    /**
     * @param {Object} options
     * @param {number} [options.limit=60] - Max requests per window
     * @param {number} [options.windowSeconds=60] - Window length in seconds
     * @param {string} [options.prefix='global'] - Key namespace
     * @param {string} [options.message] - Message returned when blocked
     */
    constructor({ limit = 60, windowSeconds = 60, prefix = "global", message } = {}) {
        this.limit = limit;
        this.windowSeconds = windowSeconds;
        this.prefix = prefix;
        this.message = message || "Too many requests. Please try again later.";
    }

    /**
     * Client IP from proxy headers. Platform headers set by the edge (not the client) win;
     * `x-forwarded-for` is only trusted for its first hop.
     * Accepts a Request, a Headers object or a plain header record (next-auth `req`).
     */
    static getClientIp(reqOrHeaders) {
        const headers = reqOrHeaders?.headers ?? reqOrHeaders;
        if (!headers) return "unknown";

        const read = (name) => (typeof headers.get === "function" ? headers.get(name) : headers[name]);

        const direct = read("x-vercel-forwarded-for") || read("cf-connecting-ip") || read("x-real-ip");
        if (direct) return String(direct).split(",")[0].trim();

        const forwarded = read("x-forwarded-for");
        if (forwarded) return String(forwarded).split(",")[0].trim();

        return "unknown";
    }

    /**
     * @param {string} identifier - IP, user id, username...
     * @returns {Promise<{ success: boolean, limit: number, remaining: number, reset: number, retryAfter: number }>}
     */
    async check(identifier) {
        const id = String(identifier || "unknown").toLowerCase();
        const now = Math.floor(Date.now() / 1000);

        const result = await redis.slidingWindow(`rl:${this.prefix}:${id}`, this.limit, this.windowSeconds);

        const remaining = Math.max(0, this.limit - result.count);
        const retryAfter = result.allowed ? 0 : Math.max(1, result.reset - now);

        return {
            success: result.allowed,
            limit: this.limit,
            remaining,
            reset: result.reset,
            retryAfter,
        };
    }

    headersFor(result) {
        const resetIn = Math.max(0, result.reset - Math.floor(Date.now() / 1000));
        const headers = {
            "RateLimit-Limit": String(result.limit),
            "RateLimit-Remaining": String(result.remaining),
            "RateLimit-Reset": String(resetIn),
            "RateLimit-Policy": `${this.limit};w=${this.windowSeconds}`,
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": String(result.remaining),
            "X-RateLimit-Reset": String(result.reset),
        };
        if (!result.success) headers["Retry-After"] = String(result.retryAfter);
        return headers;
    }

    /**
     * For route handlers. Returns a ready 429 response when blocked.
     * @param {Request} req
     * @param {string} [customId] - e.g. the user id; defaults to the client IP
     * @returns {Promise<{ allowed: boolean, response?: NextResponse, headers: Record<string, string> }>}
     */
    async limitRequest(req, customId = null) {
        const identifier = customId || RateLimiter.getClientIp(req);
        const result = await this.check(identifier);
        const headers = this.headersFor(result);

        if (!result.success) {
            return {
                allowed: false,
                headers,
                response: NextResponse.json(
                    { success: false, message: this.message, retryAfter: result.retryAfter },
                    { status: 429, headers }
                ),
            };
        }

        return { allowed: true, headers };
    }
}

/**
 * Counts failed attempts (e.g. wrong password) and locks the identifier once `maxFailures`
 * is reached inside `windowSeconds`. Successful attempts clear the counter.
 */
export class FailureGuard {
    constructor({ prefix, maxFailures = 5, windowSeconds = 15 * 60, lockSeconds = 15 * 60 }) {
        this.prefix = prefix;
        this.maxFailures = maxFailures;
        this.windowSeconds = windowSeconds;
        this.lockSeconds = lockSeconds;
    }

    key(id) {
        return `guard:${this.prefix}:${String(id || "unknown").toLowerCase()}`;
    }

    /** @returns {Promise<{ locked: boolean, retryAfter: number }>} */
    async status(id) {
        const lockedUntil = Number(await redis.get(`${this.key(id)}:lock`)) || 0;
        const now = Math.floor(Date.now() / 1000);
        return lockedUntil > now
            ? { locked: true, retryAfter: lockedUntil - now }
            : { locked: false, retryAfter: 0 };
    }

    async fail(id) {
        const failures = await redis.incr(`${this.key(id)}:count`, this.windowSeconds);
        if (failures >= this.maxFailures) {
            const until = Math.floor(Date.now() / 1000) + this.lockSeconds;
            await redis.set(`${this.key(id)}:lock`, until, { ex: this.lockSeconds });
            await redis.del(`${this.key(id)}:count`);
        }
        return failures;
    }

    async reset(id) {
        await redis.del(`${this.key(id)}:count`, `${this.key(id)}:lock`);
    }
}

export const rateLimiters = {
    // General API reads: 120 / minute per IP
    api: new RateLimiter({ limit: 120, windowSeconds: 60, prefix: "api" }),

    // Credential sign-in attempts: 10 / minute per IP
    auth: new RateLimiter({
        limit: 10,
        windowSeconds: 60,
        prefix: "auth",
        message: "Too many sign-in attempts. Please wait a moment and try again.",
    }),

    // Account creation: 5 / 10 minutes per IP
    signup: new RateLimiter({
        limit: 5,
        windowSeconds: 10 * 60,
        prefix: "signup",
        message: "Too many accounts created from this network. Please try again later.",
    }),

    // Verification email resends: 3 / 15 minutes per user
    emailVerify: new RateLimiter({
        limit: 3,
        windowSeconds: 15 * 60,
        prefix: "email-verify",
        message: "Too many verification emails. Please wait a few minutes and try again.",
    }),

    // Verification link checks: 20 / minute per IP
    verifyEmail: new RateLimiter({ limit: 20, windowSeconds: 60, prefix: "verify-email" }),

    // Pusher private channel authorization: 60 / minute per user
    realtime: new RateLimiter({ limit: 60, windowSeconds: 60, prefix: "realtime" }),

    // Session management (list / revoke): 30 / minute per user
    session: new RateLimiter({ limit: 30, windowSeconds: 60, prefix: "session" }),

    // Refresh-token rotation: 30 / minute per IP (a healthy client needs ~1 per 15 minutes per tab)
    refresh: new RateLimiter({
        limit: 30,
        windowSeconds: 60,
        prefix: "refresh",
        message: "Too many session refreshes. Please wait a moment.",
    }),

    // Comment writes per user: 15 / minute; reads per IP: 60 / minute; votes per user: 60 / minute
    comment: new RateLimiter({ limit: 15, windowSeconds: 60, prefix: "comment" }),
    commentRead: new RateLimiter({ limit: 60, windowSeconds: 60, prefix: "comment-read" }),
    vote: new RateLimiter({ limit: 60, windowSeconds: 60, prefix: "vote" }),

    // Profile updates: 10 / minute per user
    profile: new RateLimiter({ limit: 10, windowSeconds: 60, prefix: "profile" }),

    // Feedback: 5 / 10 minutes per user or IP
    feedback: new RateLimiter({ limit: 5, windowSeconds: 10 * 60, prefix: "feedback" }),

    // File / image upload: 10 / minute per user
    upload: new RateLimiter({ limit: 10, windowSeconds: 60, prefix: "upload" }),

    // Challenge submissions per user. Code runs cost sandbox CPU, so they get their own, smaller buckets.
    quiz: new RateLimiter({ limit: 20, windowSeconds: 60, prefix: "quiz" }),
    codeRun: new RateLimiter({ limit: 10, windowSeconds: 60, prefix: "code-run" }),
    codeSubmit: new RateLimiter({ limit: 5, windowSeconds: 60, prefix: "code-submit" }),
    // Polling a queued run: the client asks every 1.5-3s, so 120 / minute leaves room for two tabs.
    codeRunPoll: new RateLimiter({ limit: 120, windowSeconds: 60, prefix: "code-run-poll" }),

    // Buying / redeeming courses: 10 / minute per user
    commerce: new RateLimiter({ limit: 10, windowSeconds: 60, prefix: "commerce" }),

    // Onboarding / preference writes: 30 / minute per user
    onboarding: new RateLimiter({ limit: 30, windowSeconds: 60, prefix: "onboarding" }),

    // Admin / course manager writes: 30 / minute per user
    admin: new RateLimiter({ limit: 30, windowSeconds: 60, prefix: "admin" }),

    // Payment provider webhooks: 300 / minute per source IP
    webhook: new RateLimiter({ limit: 300, windowSeconds: 60, prefix: "webhook" }),
};

export const failureGuards = {
    // 5 wrong passwords for one username from one IP within 15 minutes lock that pair for 15 minutes,
    // so one attacker cannot lock the real user (signing in from elsewhere) out of their account.
    loginIp: new FailureGuard({ prefix: "login-ip", maxFailures: 5, windowSeconds: 15 * 60, lockSeconds: 15 * 60 }),
    // Backstop for guessing one username from many IPs: 50 wrong passwords in 15 minutes lock it.
    login: new FailureGuard({ prefix: "login", maxFailures: 50, windowSeconds: 15 * 60, lockSeconds: 15 * 60 }),
};

export default RateLimiter;
