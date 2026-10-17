// Wrong variant: once open, the circuit never tries again - the service stays cut off
// from the fraud API long after it has recovered.
function createCircuitBreaker(fn, options, now) {
  let open = false;
  let failures = 0;
  return {
    async call(...args) {
      if (open) throw circuitOpenError();
      try {
        const value = await fn(...args);
        failures = 0;
        return value;
      } catch (error) {
        if (++failures >= options.failureThreshold) open = true;
        throw error;
      }
    },
    state() {
      return open ? "open" : "closed";
    },
  };
}

function circuitOpenError() {
  return Object.assign(new Error("Circuit is open"), { code: "CIRCUIT_OPEN" });
}
