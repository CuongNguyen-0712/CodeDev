import { Redis as UpstashRedis } from "@upstash/redis";
import IORedis from "ioredis";

/**
 * Redis client wrapper with circuit breaker, reconnect and in-memory fallback.
 *
 * - Backend: Upstash (REST) when REDIS_TOKEN + http(s) URL are set, otherwise ioredis (TCP).
 * - Every command has a timeout so a hanging Redis never blocks a request.
 * - Circuit breaker: on failure the client is marked "degraded" and commands are served from
 *   a bounded in-memory LRU. A single probe (half-open) retries after an exponential cooldown
 *   (2s -> 30s); a successful probe or the ioredis "ready" event closes the circuit again.
 * - ioredis keeps reconnecting forever with capped backoff, and reconnects on READONLY
 *   (managed Redis failover).
 * - Values are stored as JSON for both backends so they read back identically.
 *
 * Never import this from Edge code (proxy.js): ioredis needs Node.
 */

const COMMAND_TIMEOUT_MS = Number(process.env.REDIS_COMMAND_TIMEOUT_MS) || 1500;
const COOLDOWN_MIN_MS = 2_000;
const COOLDOWN_MAX_MS = 30_000;
const MEMORY_MAX_ENTRIES = 5_000;
const MEMORY_DEFAULT_TTL_SEC = 60;

const SLIDING_WINDOW_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local previous = tonumber(redis.call('GET', KEYS[2]) or '0')
local weight = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local estimate = previous * weight + current
if estimate >= limit then
    return {0, current, math.ceil(estimate)}
end
current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[3])
end
return {1, current, math.ceil(previous * weight + current)}
`;

class TimeoutError extends Error {
    constructor(ms) {
        super(`Redis command timed out after ${ms}ms`);
        this.name = "RedisTimeoutError";
    }
}

function withTimeout(promise, ms = COMMAND_TIMEOUT_MS) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
        }),
    ]).finally(() => clearTimeout(timer));
}

function serialize(value) {
    return JSON.stringify(value === undefined ? null : value);
}

function deserialize(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "string") return raw;
    try {
        return JSON.parse(raw);
    } catch {
        // Legacy keys written as plain strings.
        return raw;
    }
}

/** Small LRU with per-entry expiry, used while Redis is unreachable. */
class MemoryStore {
    constructor(maxEntries = MEMORY_MAX_ENTRIES) {
        this.maxEntries = maxEntries;
        this.map = new Map();
    }

    get(key) {
        const item = this.map.get(key);
        if (!item) return null;
        if (item.expiresAt && Date.now() > item.expiresAt) {
            this.map.delete(key);
            return null;
        }
        // Refresh recency.
        this.map.delete(key);
        this.map.set(key, item);
        return item.value;
    }

    set(key, value, ttlSeconds) {
        const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
        this.map.delete(key);
        this.map.set(key, { value, expiresAt });
        if (this.map.size > this.maxEntries) {
            this.map.delete(this.map.keys().next().value);
        }
    }

    del(key) {
        this.map.delete(key);
    }

    ttl(key) {
        const item = this.map.get(key);
        if (!item) return -2;
        if (!item.expiresAt) return -1;
        return Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 1000));
    }
}

class RedisClientWrapper {
    constructor() {
        this.clientType = null;
        this.client = null;
        this.initialized = false;
        this.status = "healthy"; // 'healthy' | 'degraded' | 'disabled'
        this.lastError = null;
        this.degradedSince = null;
        this.failures = 0;
        this.nextProbeAt = 0;
        this.probe = null;
        this.everReady = false;
        this.firstConnect = null;
        this.memory = new MemoryStore();
        this.inflight = new Map();
    }

    // ---------------------------------------------------------------- lifecycle

    ensureInit() {
        if (this.initialized) return;
        this.initialized = true;

        const REDIS_URL = process.env.REDIS_URL;
        const REDIS_TOKEN = process.env.REDIS_TOKEN;

        if (!REDIS_URL) {
            console.warn("[Redis] REDIS_URL is not set. Using in-memory cache only.");
            this.status = "disabled";
            return;
        }

        const isHttpUrl = REDIS_URL.startsWith("https://") || REDIS_URL.startsWith("http://");

        if (REDIS_TOKEN && isHttpUrl) {
            try {
                this.clientType = "upstash";
                this.client = new UpstashRedis({
                    url: REDIS_URL,
                    token: REDIS_TOKEN,
                    automaticDeserialization: false,
                    retry: { retries: 1, backoff: () => 100 },
                });
            } catch (error) {
                console.error("[Redis:upstash] Init error:", error.message);
                this.client = null;
                this.markFailure(error);
            }
            return;
        }

        this.clientType = "ioredis";
        const connectionUrl = REDIS_URL
            .replace(/^https:\/\//, "rediss://")
            .replace(/^http:\/\//, "redis://");

        try {
            this.client = new IORedis(connectionUrl, {
                lazyConnect: true,
                connectTimeout: 5_000,
                commandTimeout: COMMAND_TIMEOUT_MS,
                maxRetriesPerRequest: 1,
                enableOfflineQueue: false,
                // Keep reconnecting forever with capped backoff + jitter.
                retryStrategy: (times) => Math.min(times * 200, 5_000) + Math.floor(Math.random() * 250),
                reconnectOnError: (err) => (/READONLY|ETIMEDOUT|ECONNRESET/.test(err?.message || "") ? 2 : false),
            });

            this.client.on("ready", () => {
                this.everReady = true;
                this.markRecovered();
            });
            this.client.on("error", (err) => this.markFailure(err));
            this.client.on("end", () => {
                // Only happens after quit()/disconnect(); recreate on next use.
                this.markFailure(new Error("Connection ended"));
                this.client = null;
                this.initialized = false;
                this.everReady = false;
            });

            this.client.connect().catch((err) => this.markFailure(err));
        } catch (error) {
            console.error("[Redis:ioredis] Init error:", error.message);
            this.client = null;
            this.markFailure(error);
        }
    }

    markFailure(error) {
        this.failures += 1;
        this.lastError = error?.message || "connection error";
        const cooldown = Math.min(COOLDOWN_MIN_MS * 2 ** Math.min(this.failures - 1, 4), COOLDOWN_MAX_MS);
        this.nextProbeAt = Date.now() + cooldown;

        if (this.status === "healthy") {
            this.status = "degraded";
            this.degradedSince = Date.now();
            console.warn(`[Redis] Degraded (${this.lastError}). Serving from memory, next probe in ${cooldown}ms.`);
        }
    }

    markRecovered() {
        const wasDegraded = this.status === "degraded";
        this.failures = 0;
        this.nextProbeAt = 0;
        if (this.status !== "disabled") this.status = "healthy";
        if (wasDegraded) {
            const downtime = this.degradedSince ? Date.now() - this.degradedSince : 0;
            console.info(`[Redis] Recovered after ${Math.round(downtime / 1000)}s.`);
            this.degradedSince = null;
        }
    }

    async ping() {
        this.ensureInit();
        if (!this.client) return false;
        try {
            if (this.clientType === "ioredis" && ["wait", "end"].includes(this.client.status)) {
                await withTimeout(this.client.connect(), 5_000).catch(() => { });
            }
            const res = await withTimeout(this.client.ping());
            return String(res).toUpperCase() === "PONG";
        } catch {
            return false;
        }
    }

    /** Circuit breaker gate. Only one probe runs at a time while degraded. */
    async isHealthy() {
        this.ensureInit();
        if (this.status === "disabled") return false;
        if (!this.client) {
            // ioredis "end" dropped the client; try to rebuild after the cooldown.
            if (Date.now() < this.nextProbeAt) return false;
            this.ensureInit();
            if (!this.client) return false;
        }
        if (this.status === "healthy") return true;
        if (Date.now() < this.nextProbeAt) return false;

        if (!this.probe) {
            this.probe = this.ping()
                .then((alive) => {
                    if (alive) this.markRecovered();
                    else this.markFailure(new Error(this.lastError || "probe failed"));
                    return alive;
                })
                .finally(() => {
                    this.probe = null;
                });
        }
        return this.probe;
    }

    /**
     * The first command after boot can arrive while ioredis is still connecting; with the
     * offline queue disabled it would fail and open the circuit for nothing. Wait for the
     * initial "ready" (bounded) instead. Later reconnects are handled by the breaker.
     */
    async waitForFirstConnect(ms = 1_000) {
        const client = this.client;
        if (this.clientType !== "ioredis" || !client || this.everReady || this.status !== "healthy") return;
        if (!["wait", "connecting", "connect"].includes(client.status)) return;

        // One shared wait for every request that arrives during boot; stops at the first error.
        if (!this.firstConnect) {
            this.firstConnect = new Promise((resolve) => {
                const done = () => {
                    clearTimeout(timer);
                    client.off("ready", done);
                    client.off("error", done);
                    this.firstConnect = null;
                    resolve();
                };
                const timer = setTimeout(done, ms);
                client.once("ready", done);
                client.once("error", done);
            });
        }

        await this.firstConnect;
    }

    /** Runs a command against Redis, or returns `fallback()` when the circuit is open / it fails. */
    async exec(command, fallback) {
        this.ensureInit();
        await this.waitForFirstConnect();
        if (!(await this.isHealthy())) return fallback();
        try {
            return await withTimeout(command(this.client));
        } catch (error) {
            this.markFailure(error);
            return fallback();
        }
    }

    health() {
        this.ensureInit();
        return {
            backend: this.clientType || "memory",
            status: this.status,
            lastError: this.lastError,
            degradedSince: this.degradedSince ? new Date(this.degradedSince).toISOString() : null,
            memoryEntries: this.memory.map.size,
        };
    }

    // ---------------------------------------------------------------- key/value

    async get(key) {
        return this.exec(
            async (client) => {
                const value = deserialize(await client.get(key));
                if (value !== null) this.memory.set(key, value, MEMORY_DEFAULT_TTL_SEC);
                return value;
            },
            () => this.memory.get(key)
        );
    }

    /**
     * @param {string} key
     * @param {*} value
     * @param {{ ex?: number, EX?: number, nx?: boolean }} [options]
     * @returns {Promise<"OK" | null>} null when `nx` is set and the key already exists
     */
    async set(key, value, options = {}) {
        const ttlSeconds = options.ex || options.EX;
        const nx = Boolean(options.nx);
        const raw = serialize(value);

        return this.exec(
            async (client) => {
                let res;
                if (this.clientType === "upstash") {
                    const opts = {};
                    if (ttlSeconds) opts.ex = ttlSeconds;
                    if (nx) opts.nx = true;
                    res = await client.set(key, raw, opts);
                } else {
                    const args = [key, raw];
                    if (ttlSeconds) args.push("EX", ttlSeconds);
                    if (nx) args.push("NX");
                    res = await client.set(...args);
                }
                if (res === "OK") this.memory.set(key, value, ttlSeconds || MEMORY_DEFAULT_TTL_SEC);
                return res === "OK" ? "OK" : null;
            },
            () => {
                if (nx && this.memory.get(key) !== null) return null;
                this.memory.set(key, value, ttlSeconds);
                return "OK";
            }
        );
    }

    /**
     * Like `set` but never falls back silently: throws when Redis is unreachable so the caller
     * (the auth outbox) can retry later. With Redis disabled (no REDIS_URL) the memory store is the
     * only cache, so writing it is enough.
     */
    async setOrThrow(key, value, { ex } = {}) {
        this.ensureInit();
        if (this.status === "disabled") {
            this.memory.set(key, value, ex);
            return "OK";
        }

        await this.waitForFirstConnect();
        if (!(await this.isHealthy())) {
            throw new Error(`Redis unavailable (${this.lastError || "degraded"})`);
        }

        const raw = serialize(value);
        try {
            const res = this.clientType === "upstash"
                ? await withTimeout(this.client.set(key, raw, ex ? { ex } : {}))
                : await withTimeout(ex ? this.client.set(key, raw, "EX", ex) : this.client.set(key, raw));
            this.memory.set(key, value, ex || MEMORY_DEFAULT_TTL_SEC);
            return res;
        } catch (error) {
            this.markFailure(error);
            throw error;
        }
    }

    async del(...keys) {
        const list = keys.flat().filter(Boolean);
        if (list.length === 0) return 0;
        list.forEach((key) => this.memory.del(key));
        return this.exec((client) => client.del(...list), () => 0);
    }

    async exists(key) {
        return this.exec(
            (client) => client.exists(key),
            () => (this.memory.get(key) !== null ? 1 : 0)
        );
    }

    async incr(key, ttlSeconds) {
        const value = await this.exec(
            async (client) => {
                const next = Number(await client.incr(key));
                if (ttlSeconds && next === 1) await client.expire(key, ttlSeconds);
                return next;
            },
            () => (Number(this.memory.get(key)) || 0) + 1
        );
        this.memory.set(key, value, ttlSeconds || null);
        return value;
    }

    async expire(key, ttlSeconds) {
        return this.exec((client) => client.expire(key, ttlSeconds), () => {
            const value = this.memory.get(key);
            if (value !== null) this.memory.set(key, value, ttlSeconds);
            return value !== null ? 1 : 0;
        });
    }

    // ---------------------------------------------------------------- sets

    async sadd(key, members, ttlSeconds) {
        const list = [].concat(members).map(String);
        return this.exec(
            async (client) => {
                const added = await client.sadd(key, ...list);
                if (ttlSeconds) await client.expire(key, ttlSeconds);
                return added;
            },
            () => {
                const set = new Set(this.memory.get(key) || []);
                list.forEach((m) => set.add(m));
                this.memory.set(key, [...set], ttlSeconds);
                return list.length;
            }
        );
    }

    async srem(key, members) {
        const list = [].concat(members).map(String);
        return this.exec(
            (client) => client.srem(key, ...list),
            () => {
                const ttl = this.memory.ttl(key);
                const set = new Set(this.memory.get(key) || []);
                list.forEach((m) => set.delete(m));
                this.memory.set(key, [...set], ttl > 0 ? ttl : null);
                return list.length;
            }
        );
    }

    async smembers(key) {
        return this.exec(
            async (client) => (await client.smembers(key)).map(String),
            () => this.memory.get(key) || []
        );
    }

    // ---------------------------------------------------------------- locks

    /**
     * Best-effort distributed lock (SET NX EX). Returns a release function, or null if held.
     * Falls back to a per-instance lock while Redis is down.
     */
    async acquireLock(key, ttlSeconds = 10) {
        const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        const ok = await this.set(key, token, { ex: ttlSeconds, nx: true });
        if (ok !== "OK") return null;

        return async () => {
            const current = await this.get(key);
            if (current === token) await this.del(key);
        };
    }

    // ---------------------------------------------------------------- read-through cache

    /**
     * Read-through cache with per-instance request coalescing.
     * Loader errors are never cached; `null`/`undefined` results are only cached with `cacheNull`.
     *
     * @template T
     * @param {string} key
     * @param {number} ttlSeconds
     * @param {() => Promise<T>} loader
     * @param {{ cacheNull?: boolean }} [options]
     * @returns {Promise<T>}
     */
    async remember(key, ttlSeconds, loader, { cacheNull = false } = {}) {
        const cached = await this.get(key);
        if (cached !== null && cached !== undefined) {
            return cached && typeof cached === "object" && cached.__null === true ? null : cached;
        }

        if (this.inflight.has(key)) return this.inflight.get(key);

        const promise = (async () => {
            const value = await loader();
            if (value === null || value === undefined) {
                if (cacheNull) await this.set(key, { __null: true }, { ex: Math.min(ttlSeconds, 30) });
                return value ?? null;
            }
            await this.set(key, value, { ex: ttlSeconds });
            return value;
        })().finally(() => this.inflight.delete(key));

        this.inflight.set(key, promise);
        return promise;
    }

    // ---------------------------------------------------------------- rate limiting

    /**
     * Sliding-window counter (current + weighted previous window). Denied requests are not counted,
     * so a throttled client recovers as soon as the window slides.
     *
     * @returns {Promise<{ allowed: boolean, count: number, reset: number }>}
     */
    async slidingWindow(prefixKey, limit, windowSeconds) {
        const nowMs = Date.now();
        const windowMs = windowSeconds * 1000;
        const bucket = Math.floor(nowMs / windowMs);
        const elapsed = (nowMs % windowMs) / windowMs;
        const weight = (1 - elapsed).toFixed(4);
        const currentKey = `${prefixKey}:${bucket}`;
        const previousKey = `${prefixKey}:${bucket - 1}`;
        const reset = Math.ceil(((bucket + 1) * windowMs) / 1000);

        const parse = (res) => ({
            allowed: Number(res?.[0]) === 1,
            count: Number(res?.[2]) || 0,
            reset,
        });

        return this.exec(
            async (client) => {
                const res = this.clientType === "upstash"
                    ? await client.eval(SLIDING_WINDOW_LUA, [currentKey, previousKey], [weight, limit, windowSeconds * 2])
                    : await client.eval(SLIDING_WINDOW_LUA, 2, currentKey, previousKey, weight, limit, windowSeconds * 2);
                return parse(res);
            },
            () => {
                const current = Number(this.memory.get(`rl:${currentKey}`)) || 0;
                const previous = Number(this.memory.get(`rl:${previousKey}`)) || 0;
                const estimate = previous * Number(weight) + current;
                if (estimate >= limit) return { allowed: false, count: Math.ceil(estimate), reset };
                this.memory.set(`rl:${currentKey}`, current + 1, windowSeconds * 2);
                return { allowed: true, count: Math.ceil(estimate + 1), reset };
            }
        );
    }
}

// Reuse one client across hot reloads / route module instances.
const globalForRedis = globalThis;
export const redis = globalForRedis.__codedevRedis || new RedisClientWrapper();
if (process.env.NODE_ENV !== "production") globalForRedis.__codedevRedis = redis;

export default redis;
