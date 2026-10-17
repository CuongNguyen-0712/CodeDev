// Wrong variant: counts every failure ever seen instead of consecutive failures, so a
// healthy service with occasional errors eventually trips the breaker.
function createCircuitBreaker(fn, options, now) {
  const { failureThreshold, resetTimeoutMs, halfOpenMaxCalls } = options;
  let mode = "closed";
  let failures = 0;
  let openedAt = 0;
  let trials = 0;
  const current = () => (mode === "open" && now() - openedAt >= resetTimeoutMs ? "half_open" : mode);
  return {
    async call(...args) {
      const state = current();
      if (state === "open") throw circuitOpenError();
      const trial = state === "half_open";
      if (trial && trials >= halfOpenMaxCalls) throw circuitOpenError();
      if (trial) trials++;
      try {
        const value = await fn(...args);
        if (trial) { mode = "closed"; failures = 0; }
        return value;
      } catch (error) {
        if (trial || ++failures >= failureThreshold) { mode = "open"; openedAt = now(); failures = 0; }
        throw error;
      } finally {
        if (trial) trials--;
      }
    },
    state: () => current(),
  };
}

function circuitOpenError() {
  return Object.assign(new Error("Circuit is open"), { code: "CIRCUIT_OPEN" });
}
