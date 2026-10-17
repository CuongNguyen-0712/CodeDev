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

  return {
    async handle(key, fingerprint, fn) {
      // TODO: look up the key, handle the in-flight / completed / mismatch cases,
      // otherwise reserve the key, run fn() and store what it returned.
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
