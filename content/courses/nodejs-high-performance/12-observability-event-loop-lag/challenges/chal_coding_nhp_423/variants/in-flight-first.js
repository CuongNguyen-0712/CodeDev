// Wrong variant: checks the in-flight limit before the lag, so an overloaded event loop
// is reported (and alerted on) as a concurrency problem.
function createLoadShedder({ maxInFlight, maxLagMs }, getLag) {
  let inFlight = 0;
  return {
    admit() {
      if (inFlight >= maxInFlight) return { accepted: false, reason: "in_flight" };
      if (getLag() > maxLagMs) return { accepted: false, reason: "lag" };
      inFlight++;
      let released = false;
      return { accepted: true, release: () => { if (!released) { released = true; inFlight--; } } };
    },
    inFlight: () => inFlight,
  };
}
