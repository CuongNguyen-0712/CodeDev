// Wrong variant: a failed trial re-opens the circuit but keeps the ORIGINAL openedAt, so the
// very next request is another trial - the breaker hammers the failing service.
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
        mode = "closed";
        failures = 0;
        return value;
      } catch (error) {
        if (trial) mode = "open";
        else if (++failures >= failureThreshold) { mode = "open"; openedAt = now(); failures = 0; }
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
