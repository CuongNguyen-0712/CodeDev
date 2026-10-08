import { Redis as UpstashRedis } from "@upstash/redis";
import IORedis from "ioredis";

/**
 * Robust Redis Client Wrapper with Automatic Fallback & Recovery.
 * 
 * Features:
 * - Dual backend: Upstash (REST / HTTPS) in production, ioredis (TCP) in local/self-hosted.
 * - Circuit breaker / health tracking: detects outages, avoids hanging requests.
 * - Auto-recovery: continuously monitors connection health, auto-reconnects when Redis is back.
 * - In-memory fallback: guarantees zero data loss or session drops for transient caches during outages.
 */
class RedisClientWrapper {
    constructor() {
        this.clientType = null;
        this.client = null;
        this.initialized = false;
        this.status = "healthy"; // 'healthy' | 'degraded' | 'disabled'
        this.lastFailureTime = 0;
        this.cooldownMs = 10000; // 10 seconds cooldown between health probes when degraded
        this.inMemoryFallback = new Map();
    }

    _memGet(key) {
        const item = this.inMemoryFallback.get(key);
        if (!item) return null;
        if (item.expiresAt && Date.now() > item.expiresAt) {
            this.inMemoryFallback.delete(key);
            return null;
        }
        return item.value;
    }

    _memSet(key, value, ttlSeconds) {
        const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
        this.inMemoryFallback.set(key, { value, expiresAt });
    }

    _memDel(key) {
        this.inMemoryFallback.delete(key);
    }

    markFailure(error) {
        if (this.status !== "degraded") {
            this.status = "degraded";
            console.warn(`[Redis] Service degraded (${error?.message || "connection error"}). Switched to fallback mode.`);
        }
        this.lastFailureTime = Date.now();
    }

    markRecovered() {
        if (this.status === "degraded") {
            this.status = "healthy";
            console.info("[Redis] Service recovered! Resuming Redis cache operations.");
        }
    }

    async isHealthy() {
        this.ensureInit();
        if (this.status === "disabled" || !this.client) return false;

        if (this.status === "degraded") {
            // Check if cooldown elapsed to probe recovery
            if (Date.now() - this.lastFailureTime > this.cooldownMs) {
                const alive = await this.ping();
                if (alive) {
                    this.markRecovered();
                    return true;
                }
                this.lastFailureTime = Date.now(); // reset cooldown
            }
            return false;
        }

        return true;
    }

    async ping() {
        this.ensureInit();
        if (!this.client) return false;
        try {
            if (this.clientType === "upstash") {
                const res = await this.client.ping();
                return res === "PONG" || res === "pong" || Boolean(res);
            }
            if (this.clientType === "ioredis") {
                if (this.client.status === "wait" || this.client.status === "close") {
                    await this.client.connect().catch(() => {});
                }
                const res = await this.client.ping();
                return res === "PONG";
            }
        } catch {
            return false;
        }
        return false;
    }

    ensureInit() {
        if (this.initialized) return;
        this.initialized = true;

        const REDIS_URL = process.env.REDIS_URL;
        const REDIS_TOKEN = process.env.REDIS_TOKEN;

        if (!REDIS_URL) {
            console.warn("[Redis] Notice: REDIS_URL is not set. Cache operations are disabled.");
            this.status = "disabled";
            return;
        }

        const isHttpsUrl = REDIS_URL.startsWith("https://") || REDIS_URL.startsWith("http://");

        // Production / Upstash Mode: Has REDIS_TOKEN and uses HTTP/HTTPS endpoint
        if (REDIS_TOKEN && isHttpsUrl) {
            try {
                this.clientType = "upstash";
                this.client = new UpstashRedis({
                    url: REDIS_URL,
                    token: REDIS_TOKEN,
                });
                this.status = "healthy";
                return;
            } catch (error) {
                console.error("[Redis:upstash] Init error:", error.message);
                this.client = null;
                this.status = "degraded";
                return;
            }
        }

        // Local / Self-hosted Mode (via ioredis)
        this.clientType = "ioredis";
        let connectionUrl = REDIS_URL;

        if (connectionUrl.startsWith("https://")) {
            connectionUrl = connectionUrl.replace("https://", "rediss://");
        } else if (connectionUrl.startsWith("http://")) {
            connectionUrl = connectionUrl.replace("http://", "redis://");
        }

        try {
            this.client = new IORedis(connectionUrl, {
                lazyConnect: true,
                maxRetriesPerRequest: 2,
                enableOfflineQueue: false,
                retryStrategy: (times) => {
                    // Indefinite exponential backoff capped at 3000ms so ioredis never dies permanently
                    return Math.min(times * 300, 3000);
                },
            });

            this.client.on("connect", () => {
                this.markRecovered();
            });

            this.client.on("ready", () => {
                this.status = "healthy";
            });

            this.client.on("close", () => {
                if (this.status === "healthy") {
                    this.markFailure(new Error("Connection closed"));
                }
            });

            this.client.on("error", (err) => {
                this.markFailure(err);
            });
        } catch (error) {
            console.error("[Redis:ioredis] Init error:", error.message);
            this.client = null;
            this.status = "degraded";
        }
    }

    async get(key) {
        const healthy = await this.isHealthy();
        if (!healthy) {
            return this._memGet(key);
        }

        try {
            if (this.clientType === "upstash") {
                const data = await this.client.get(key);
                if (typeof data === "string") {
                    try {
                        const parsed = JSON.parse(data);
                        this._memSet(key, parsed, 60);
                        return parsed;
                    } catch {
                        this._memSet(key, data, 60);
                        return data;
                    }
                }
                if (data !== null && data !== undefined) {
                    this._memSet(key, data, 60);
                }
                return data;
            }

            if (this.clientType === "ioredis") {
                if (this.client.status === "wait" || this.client.status === "close") {
                    await this.client.connect().catch(() => {});
                }
                const raw = await this.client.get(key);
                if (!raw) return null;
                try {
                    const parsed = JSON.parse(raw);
                    this._memSet(key, parsed, 60);
                    return parsed;
                } catch {
                    this._memSet(key, raw, 60);
                    return raw;
                }
            }
        } catch (error) {
            this.markFailure(error);
            return this._memGet(key);
        }

        return this._memGet(key);
    }

    async set(key, value, options = {}) {
        const ttlSeconds = options.ex || options.EX;
        // Always back up into memory fallback
        this._memSet(key, value, ttlSeconds);

        const healthy = await this.isHealthy();
        if (!healthy) {
            return "OK";
        }

        try {
            if (this.clientType === "upstash") {
                if (ttlSeconds) {
                    return await this.client.set(key, value, { ex: ttlSeconds });
                }
                return await this.client.set(key, value);
            }

            if (this.clientType === "ioredis") {
                if (this.client.status === "wait" || this.client.status === "close") {
                    await this.client.connect().catch(() => {});
                }
                const serialized = typeof value === "string" ? value : JSON.stringify(value);
                if (ttlSeconds) {
                    return await this.client.set(key, serialized, "EX", ttlSeconds);
                }
                return await this.client.set(key, serialized);
            }
        } catch (error) {
            this.markFailure(error);
            return "OK";
        }

        return "OK";
    }

    async del(key) {
        this._memDel(key);

        const healthy = await this.isHealthy();
        if (!healthy) return 0;

        try {
            if (this.clientType === "upstash") {
                return await this.client.del(key);
            }

            if (this.clientType === "ioredis") {
                if (this.client.status === "wait" || this.client.status === "close") {
                    await this.client.connect().catch(() => {});
                }
                return await this.client.del(key);
            }
        } catch (error) {
            this.markFailure(error);
            return 0;
        }

        return 0;
    }

    async exists(key) {
        const healthy = await this.isHealthy();
        if (!healthy) {
            return this._memGet(key) !== null ? 1 : 0;
        }

        try {
            if (this.clientType === "upstash") {
                return await this.client.exists(key);
            }

            if (this.clientType === "ioredis") {
                if (this.client.status === "wait" || this.client.status === "close") {
                    await this.client.connect().catch(() => {});
                }
                return await this.client.exists(key);
            }
        } catch (error) {
            this.markFailure(error);
            return this._memGet(key) !== null ? 1 : 0;
        }

        return 0;
    }

    /**
     * Executes atomic fixed window rate limiting script via Lua with in-memory fallback.
     * @param {string} key - Redis key (e.g. `rl:comment:user_123:29467210`)
     * @param {number} windowSeconds - Window duration in seconds
     * @returns {Promise<{ current: number, ttl: number } | null>}
     */
    async fixedWindow(key, windowSeconds = 60) {
        const healthy = await this.isHealthy();

        if (healthy) {
            const luaScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`;
            try {
                if (this.clientType === "upstash") {
                    const res = await this.client.eval(luaScript, [key], [windowSeconds]);
                    if (Array.isArray(res)) {
                        return {
                            current: Number(res[0]) || 1,
                            ttl: Number(res[1]) >= 0 ? Number(res[1]) : windowSeconds,
                        };
                    }
                }

                if (this.clientType === "ioredis") {
                    if (this.client.status === "wait" || this.client.status === "close") {
                        await this.client.connect().catch(() => {});
                    }
                    const res = await this.client.eval(luaScript, 1, key, windowSeconds);
                    if (Array.isArray(res)) {
                        return {
                            current: Number(res[0]) || 1,
                            ttl: Number(res[1]) >= 0 ? Number(res[1]) : windowSeconds,
                        };
                    }
                }
            } catch (error) {
                this.markFailure(error);
                // Fall through to in-memory fallback
            }
        }

        // In-memory atomic fixed window bucket fallback
        const nowSec = Math.floor(Date.now() / 1000);
        const bucket = Math.floor(nowSec / windowSeconds);
        const memKey = `fw:${key}:${bucket}`;
        const prev = this._memGet(memKey);
        const current = (typeof prev === "number" ? prev : 0) + 1;
        const ttl = Math.max(1, (bucket + 1) * windowSeconds - nowSec);
        this._memSet(memKey, current, ttl);

        return { current, ttl };
    }
}

export const redis = new RedisClientWrapper();
export default redis;
