// Wrong variant: only completed results are stored. Duplicates that arrive while the first
// charge is still running find nothing and charge again (the double tap still double-charges).
function createIdempotencyStore(options) {
  const { ttlMs, now } = options;
  const done = new Map();

  return {
    async handle(key, fingerprint, fn) {
      const record = done.get(key);
      if (record && record.expiresAt > now()) {
        if (record.fingerprint !== fingerprint) throw httpError(422, "IDEMPOTENCY_KEY_REUSED");
        return { replayed: true, result: record.result };
      }
      const result = await fn();
      done.set(key, { fingerprint, result, expiresAt: now() + ttlMs });
      return { replayed: false, result };
    },
  };
}

function httpError(status, code) {
  return Object.assign(new Error(code), { status, code });
}
