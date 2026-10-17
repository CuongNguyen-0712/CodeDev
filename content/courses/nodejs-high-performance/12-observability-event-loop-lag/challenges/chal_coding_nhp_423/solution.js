/**
 * Reference solution (never shipped to learners).
 */
function createLoadShedder({ maxInFlight, maxLagMs }, getLag) {
  let inFlight = 0;

  return {
    admit() {
      if (getLag() > maxLagMs) return { accepted: false, reason: "lag" };
      if (inFlight >= maxInFlight) return { accepted: false, reason: "in_flight" };

      inFlight++;
      let released = false;
      return {
        accepted: true,
        release: () => {
          if (released) return;
          released = true;
          inFlight--;
        },
      };
    },

    inFlight: () => inFlight,
  };
}
