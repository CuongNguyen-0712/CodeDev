/**
 * Reference solution (never shipped to learners).
 * "half_open" is derived from the clock, so state() and call() always agree on it.
 */
function createCircuitBreaker(fn, options, now) {
  const { failureThreshold, resetTimeoutMs, halfOpenMaxCalls } = options;
  let mode = "closed"; // "closed" | "open" (half_open = open + reset timeout elapsed)
  let failures = 0;
  let openedAt = 0;
  let trialsInFlight = 0;

  const current = () => (mode === "open" && now() - openedAt >= resetTimeoutMs ? "half_open" : mode);

  const open = () => {
    mode = "open";
    openedAt = now();
    failures = 0;
  };

  return {
    async call(...args) {
      const state = current();
      if (state === "open") throw circuitOpenError();

      const trial = state === "half_open";
      if (trial) {
        if (trialsInFlight >= halfOpenMaxCalls) throw circuitOpenError();
        trialsInFlight++;
      }

      try {
        const value = await fn(...args);
        if (trial || mode === "closed") {
          mode = "closed";
          failures = 0;
        }
        return value;
      } catch (error) {
        if (trial) {
          open();
        } else if (mode === "closed" && ++failures >= failureThreshold) {
          open();
        }
        throw error;
      } finally {
        if (trial) trialsInFlight--;
      }
    },

    state() {
      return current();
    },
  };
}

function circuitOpenError() {
  return Object.assign(new Error("Circuit is open: fraud-scoring calls are failing fast"), { code: "CIRCUIT_OPEN" });
}
