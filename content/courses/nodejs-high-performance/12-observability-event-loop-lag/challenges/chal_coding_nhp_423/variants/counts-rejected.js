// Wrong variant: increments before deciding, so every rejected request leaks a slot
// and the instance ends up rejecting everything.
function createLoadShedder({ maxInFlight, maxLagMs }, getLag) {
  let inFlight = 0;
  return {
    admit() {
      inFlight++;
      if (getLag() > maxLagMs) return { accepted: false, reason: "lag" };
      if (inFlight > maxInFlight) return { accepted: false, reason: "in_flight" };
      let released = false;
      return { accepted: true, release: () => { if (!released) { released = true; inFlight--; } } };
    },
    inFlight: () => inFlight,
  };
}
