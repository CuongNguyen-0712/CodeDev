/**
 * Build the idempotency layer that sits in front of POST /payments.
 *
 * handle(key, fingerprint, fn) runs `fn` (the real charge) at most once per Idempotency-Key:
 *   - first request for a key        -> run fn(), remember its result, resolve { replayed: false, result }
 *   - retry after it completed        -> do NOT run fn again, resolve { replayed: true, result } (the stored result)
 *   - duplicate while fn is running   -> reject with httpError(409, "IDEMPOTENCY_KEY_IN_PROGRESS")
 *   - same key, different fingerprint -> reject with httpError(422, "IDEMPOTENCY_KEY_REUSED")
 *                                        (checked first, whether the original is still running or done)
 *   - fn throws                       -> forget the key (so the client may retry) and rethrow the same error
 *   - a completed key expires options.ttlMs after it completed; after that the key is free again
 *
 * Read the time only through options.now() (milliseconds), never Date.now().
 *
 * @param {{ ttlMs: number, now: () => number }} options
 * @returns {{ handle(key: string, fingerprint: string, fn: () => Promise<any>): Promise<{ replayed: boolean, result: any }> }}
 */
function createIdempotencyStore(options) {
  const { ttlMs, now } = options;
  // @piece records: Where each key's state is kept
  const records = new Map(); // key -> { fingerprint, state: "in_flight" | "completed", result, expiresAt }
  // @end

  return {
    async handle(key, fingerprint, fn) {
      // @piece expire-old: Forget a completed key once it has expired
      let record = records.get(key);
      if (record && record.state === "completed" && record.expiresAt <= now()) {
        records.delete(key);
        record = undefined;
      }
      // @end

      // @piece known-key: Answer a key that is already known
      if (record) {
        if (record.fingerprint !== fingerprint) throw httpError(422, "IDEMPOTENCY_KEY_REUSED");
        if (record.state === "in_flight") throw httpError(409, "IDEMPOTENCY_KEY_IN_PROGRESS");
        return { replayed: true, result: record.result };
      }
      // @end

      // @piece reserve-key: Reserve the key for this request
      const reserved = { fingerprint, state: "in_flight" };
      records.set(key, reserved);
      // @end

      // @piece run-and-store: Run the charge and keep its result
      try {
        const result = await fn();
        records.set(key, { fingerprint, state: "completed", result, expiresAt: now() + ttlMs });
        return { replayed: false, result };
      } catch (error) {
        if (records.get(key) === reserved) records.delete(key);
        throw error;
      }
      // @end
    },
  };
}

/**
 * Creates an Error carrying an HTTP status, e.g. httpError(409, "IDEMPOTENCY_KEY_IN_PROGRESS").
 * @param {number} status
 * @param {string} code
 */
function httpError(status, code) {
  return Object.assign(new Error(code), { status, code });
}
