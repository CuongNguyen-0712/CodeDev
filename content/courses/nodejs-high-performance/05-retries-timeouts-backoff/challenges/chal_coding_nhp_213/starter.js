/**
 * Wrap a call to the fraud-scoring service in a circuit breaker.
 *
 * States:
 *   "closed"    -> every call goes to fn. Count CONSECUTIVE failures (a success resets the count).
 *                  When the count reaches failureThreshold the circuit opens.
 *   "open"      -> calls fail fast WITHOUT calling fn: reject with circuitOpenError().
 *                  Once resetTimeoutMs has passed since the circuit opened, it is "half_open".
 *   "half_open" -> trial calls go to fn, but at most halfOpenMaxCalls may be in flight at the same
 *                  time; any extra call is rejected with circuitOpenError().
 *                  A trial that succeeds closes the circuit (failure count back to 0).
 *                  A trial that fails opens it again, and the resetTimeoutMs wait starts over.
 *
 * call(...args) resolves/rejects with whatever fn(...args) resolved/rejected with (unless rejected
 * fast). state() returns the current state - including "half_open" as soon as resetTimeoutMs has
 * elapsed, even before the next call. Read the time only through now() (milliseconds).
 *
 * @param {(...args: any[]) => Promise<any>} fn
 * @param {{ failureThreshold: number, resetTimeoutMs: number, halfOpenMaxCalls: number }} options
 * @param {() => number} now
 * @returns {{ call(...args: any[]): Promise<any>, state(): "closed" | "open" | "half_open" }}
 */
function createCircuitBreaker(fn, options, now) {
  const { failureThreshold, resetTimeoutMs, halfOpenMaxCalls } = options;

  return {
    async call(...args) {
      // TODO: fail fast while open, limit trial calls while half-open,
      // and update the state from the outcome of fn.
      return fn(...args);
    },

    state() {
      // TODO
      return "closed";
    },
  };
}

/** The error to reject with while the circuit does not let a call through. */
function circuitOpenError() {
  return Object.assign(new Error("Circuit is open: fraud-scoring calls are failing fast"), { code: "CIRCUIT_OPEN" });
}
