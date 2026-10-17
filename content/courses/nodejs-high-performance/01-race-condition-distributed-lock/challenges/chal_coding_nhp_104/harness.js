// Harness: Build acquire/release for a Redis-style distributed lock
// Runs a script of lock operations against an in-memory Redis with a controllable
// clock. Output: one entry per acquire/release step -
//   acquire -> true (got a token) / false (null, lock held) / "invalid"
//   release -> true / false / "invalid"
async function __harness(input) {
    let now = 0;
    const store = new Map();

    const alive = (key) => {
        const entry = store.get(key);
        if (!entry) return null;
        if (entry.expiresAt <= now) {
            store.delete(key);
            return null;
        }
        return entry;
    };

    // Deliberately no plain DEL: releasing without checking the owner is the bug to avoid.
    const redis = {
        async set(key, value, opts = {}) {
            if (opts.NX && alive(key)) return null;
            const ttl = Number(opts.PX);
            store.set(key, { value: String(value), expiresAt: ttl > 0 ? now + ttl : Infinity });
            return "OK";
        },
        async get(key) {
            const entry = alive(key);
            return entry ? entry.value : null;
        },
        async delIfEquals(key, value) {
            const entry = alive(key);
            if (entry && entry.value === value) {
                store.delete(key);
                return 1;
            }
            return 0;
        },
    };

    let counter = 0;
    const lock = createLock(redis, { generateToken: () => `token-${++counter}` });
    const tokens = {};
    const output = [];

    for (const step of input.steps || []) {
        if (step.op === "advance") {
            now += Number(step.ms) || 0;
        } else if (step.op === "acquire") {
            const token = await lock.acquire(step.key, step.ttlMs);
            tokens[step.as] = token;
            output.push(token === null ? false : (typeof token === "string" && token.length > 0 ? true : "invalid"));
        } else if (step.op === "release") {
            const token = step.forged !== undefined ? step.forged : tokens[step.as];
            const released = await lock.release(step.key, token);
            output.push(released === true ? true : released === false ? false : "invalid");
        }
    }

    return output;
}
