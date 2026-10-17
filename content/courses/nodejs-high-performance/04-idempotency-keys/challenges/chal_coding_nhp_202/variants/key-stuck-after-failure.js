// Wrong variant: when the charge fails, the key stays "in flight" forever,
// so every retry of a failed payment is answered with 409 and can never succeed.
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
        if (record.fingerprint !== fingerprint) throw httpError(422, "IDEMPOTENCY_KEY_REUSED");
        if (record.state === "in_flight") throw httpError(409, "IDEMPOTENCY_KEY_IN_PROGRESS");
        return { replayed: true, result: record.result };
      }
      records.set(key, { fingerprint, state: "in_flight" });
      const result = await fn();
      records.set(key, { fingerprint, state: "completed", result, expiresAt: now() + ttlMs });
      return { replayed: false, result };
    },
  };
}

function httpError(status, code) {
  return Object.assign(new Error(code), { status, code });
}
