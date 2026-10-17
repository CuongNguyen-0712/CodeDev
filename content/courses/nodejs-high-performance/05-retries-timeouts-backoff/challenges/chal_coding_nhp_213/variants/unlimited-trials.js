// Wrong variant: half-open lets every waiting request through at once - the recovering
// fraud API is hit by the whole backlog instead of a few trial calls.
function createCircuitBreaker(fn, options, now) {
  const { failureThreshold, resetTimeoutMs } = options;
  let mode = "closed";
  let failures = 0;
  let openedAt = 0;
  const current = () => (mode === "open" && now() - openedAt >= resetTimeoutMs ? "half_open" : mode);
  return {
    async call(...args) {
      const state = current();
      if (state === "open") throw circuitOpenError();
      try {
        const value = await fn(...args);
        mode = "closed";
        failures = 0;
        return value;
      } catch (error) {
        if (state === "half_open" || ++failures >= failureThreshold) {
          mode = "open";
          openedAt = now();
          failures = 0;
        }
        throw error;
      }
    },
    state: () => current(),
  };
}

function circuitOpenError() {
  return Object.assign(new Error("Circuit is open"), { code: "CIRCUIT_OPEN" });
}
