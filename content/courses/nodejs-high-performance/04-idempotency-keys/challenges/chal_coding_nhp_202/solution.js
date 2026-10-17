/**
 * Reference solution (never shipped to learners).
 * The key is reserved synchronously (before the first await), so a concurrent duplicate
 * sees the in-flight record instead of starting a second charge.
 */
function createIdempotencyStore(options) {
  const { ttlMs, now } = options;
  const records = new Map(); // key -> { fingerprint, state: "in_flight" | "completed", result, expiresAt }

  return {
    async handle(key, fingerprint, fn) {
      let record = records.get(key);
      if (record && record.state === "completed" && record.expiresAt <= now()) {
        records.delete(key);
        record = undefined;
      }

      if (record) {
        if (record.fingerprint !== fingerprint) throw httpError(422, "IDEMPOTENCY_KEY_REUSED");
        if (record.state === "in_flight") throw httpError(409, "IDEMPOTENCY_KEY_IN_PROGRESS");
        return { replayed: true, result: record.result };
      }

      const reserved = { fingerprint, state: "in_flight" };
      records.set(key, reserved);

      try {
        const result = await fn();
        records.set(key, { fingerprint, state: "completed", result, expiresAt: now() + ttlMs });
        return { replayed: false, result };
      } catch (error) {
        if (records.get(key) === reserved) records.delete(key);
        throw error;
      }
    },
  };
}

function httpError(status, code) {
  return Object.assign(new Error(code), { status, code });
}
