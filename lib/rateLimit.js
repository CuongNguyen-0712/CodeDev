import { redis } from "./cache.js";
import { NextResponse } from "next/server.js";

/**
 * Fixed Window Rate Limiter using Redis.
 *
 * Algorithm details:
 * - Divides time into fixed discrete windows (e.g., 60 seconds).
 * - Key pattern: `ratelimit:{prefix}:{identifier}:{windowTimestamp}`
 * - An atomic Lua script executes:
 *     INCR key
 *     if current == 1 then EXPIRE key windowSeconds
 *     return { current, TTL }
 * - If current > maxRequests, request is denied with 429 Too Many Requests.
 * - Standard HTTP headers included:
 *     X-RateLimit-Limit: max allowed requests in window
 *     X-RateLimit-Remaining: remaining requests in current window
 *     X-RateLimit-Reset: unix timestamp when window expires
 *     Retry-After: seconds to wait before retrying (when blocked)
 */
export class RateLimiter {
    /**
     * @param {Object} options
     * @param {number} [options.limit=60] - Max requests permitted in window
     * @param {number} [options.windowSeconds=60] - Duration of the window in seconds
     * @param {string} [options.prefix='global'] - Namespace prefix for redis key
     */
    constructor({ limit = 60, windowSeconds = 60, prefix = "global" } = {}) {
        this.limit = limit;
        this.windowSeconds = windowSeconds;
        this.prefix = prefix;
    }

    /**
     * Extracts a client identifier from NextRequest / Request.
     * Checks headers: x-forwarded-for, x-real-ip, or fallback to 'unknown'.
     * @param {Request} req
     * @returns {string}
     */
    static getClientIp(req) {
        if (!req) return "unknown";

        const headers = req.headers;
        if (!headers) return "unknown";

        const forwarded = headers.get ? headers.get("x-forwarded-for") : headers["x-forwarded-for"];
        if (forwarded) {
            return forwarded.split(",")[0].trim();
        }

        const realIp = headers.get ? headers.get("x-real-ip") : headers["x-real-ip"];
        if (realIp) {
            return realIp.trim();
        }

        return "unknown";
    }

    /**
     * Evaluates rate limit for a specific identifier.
     * @param {string} identifier - Unique client ID (IP address, User ID, Token ID)
     * @returns {Promise<{ success: boolean, limit: number, remaining: number, reset: number, retryAfter: number }>}
     */
    async check(identifier) {
        const id = identifier || "unknown";

        // Current fixed window bucket timestamp (e.g. floor(now / windowSeconds))
        const now = Math.floor(Date.now() / 1000);
        const windowBucket = Math.floor(now / this.windowSeconds);
        const windowResetTime = (windowBucket + 1) * this.windowSeconds;

        const redisKey = `ratelimit:${this.prefix}:${id}:${windowBucket}`;

        // Atomic Lua increment & expire
        const result = await redis.fixedWindow(redisKey, this.windowSeconds);

        // Fail-open: If Redis is unavailable, allow request to avoid blocking legitimate users
        if (!result) {
            return {
                success: true,
                limit: this.limit,
                remaining: this.limit,
                reset: windowResetTime,
                retryAfter: 0,
            };
        }

        const current = result.current;
        const ttl = result.ttl > 0 ? result.ttl : this.windowSeconds;
        const reset = now + ttl;
        const remaining = Math.max(0, this.limit - current);
        const success = current <= this.limit;
        const retryAfter = success ? 0 : ttl;

        return {
            success,
            limit: this.limit,
            remaining,
            reset,
            retryAfter,
        };
    }

    /**
     * Wraps an API route handler or Next.js middleware with Fixed Window rate limiting.
     * @param {Request} req
     * @param {string} [customId] - Optional custom identifier (e.g. session.user.id)
     * @returns {Promise<{ allowed: boolean, response?: NextResponse, headers: Record<string, string> }>}
     */
    async limitRequest(req, customId = null) {
        const identifier = customId || RateLimiter.getClientIp(req);
        const rateResult = await this.check(identifier);

        const headers = {
            "X-RateLimit-Limit": String(rateResult.limit),
            "X-RateLimit-Remaining": String(rateResult.remaining),
            "X-RateLimit-Reset": String(rateResult.reset),
        };

        if (!rateResult.success) {
            headers["Retry-After"] = String(rateResult.retryAfter);

            const response = NextResponse.json(
                {
                    success: false,
                    message: "Too many requests. Please try again later.",
                    retryAfter: rateResult.retryAfter,
                },
                {
                    status: 429,
                    headers,
                }
            );

            return {
                allowed: false,
                response,
                headers,
            };
        }

        return {
            allowed: true,
            headers,
        };
    }
}

// Pre-configured rate limiters for common application layers:
export const rateLimiters = {
    // General API endpoints: 60 requests / minute
    api: new RateLimiter({ limit: 60, windowSeconds: 60, prefix: "api" }),

    // Authentication / Sensitive endpoints: 10 requests / minute
    auth: new RateLimiter({ limit: 10, windowSeconds: 60, prefix: "auth" }),

    // Commenting / Feedback creation: 15 submissions / minute
    comment: new RateLimiter({ limit: 15, windowSeconds: 60, prefix: "comment" }),

    // File / Image upload: 10 uploads / minute
    upload: new RateLimiter({ limit: 10, windowSeconds: 60, prefix: "upload" }),
};

export default RateLimiter;
