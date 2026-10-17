// Wrong variant: release() is not idempotent - "finish" and "error" both releasing the
// same request drive the counter down and let more than maxInFlight requests in.
function createLoadShedder({ maxInFlight, maxLagMs }, getLag) {
  let inFlight = 0;
  return {
    admit() {
      if (getLag() > maxLagMs) return { accepted: false, reason: "lag" };
      if (inFlight >= maxInFlight) return { accepted: false, reason: "in_flight" };
      inFlight++;
      return { accepted: true, release: () => { inFlight--; } };
    },
    inFlight: () => inFlight,
  };
}
