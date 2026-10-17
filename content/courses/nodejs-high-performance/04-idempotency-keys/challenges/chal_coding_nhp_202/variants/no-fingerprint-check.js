// Wrong variant: ignores the request fingerprint. A reused key with a different amount
// silently gets the old payment's response instead of 422.
function createIdempotencyStore(options) {
  const { ttlMs, now } = options;
  const records = new Map();

  return {
    async handle(key, fingerprint, fn) {
      let record = records.get(key);
      if (record && record.state === "completed" && record.expiresAt <= now()) {
        records.delete(key);
        record = undefined;
      }
      if (record) {
        if (record.state === "in_flight") throw httpError(409, "IDEMPOTENCY_KEY_IN_PROGRESS");
        return { replayed: true, result: record.result };
      }
      records.set(key, { state: "in_flight" });
      try {
        const result = await fn();
        records.set(key, { state: "completed", result, expiresAt: now() + ttlMs });
        return { replayed: false, result };
      } catch (error) {
        records.delete(key);
        throw error;
      }
    },
  };
}

function httpError(status, code) {
  return Object.assign(new Error(code), { status, code });
}
