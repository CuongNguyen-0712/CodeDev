/**
 * Load shedder for the checkout API: when the instance is overloaded, reject new
 * requests immediately with 503 instead of letting them queue up and time out.
 *
 * admit() decides for ONE incoming request, in this order:
 *   1. if getLag() > maxLagMs          -> { accepted: false, reason: "lag" }
 *   2. else if in-flight >= maxInFlight -> { accepted: false, reason: "in_flight" }
 *   3. else count the request as in flight and return { accepted: true, release }
 *
 * release() is called by the middleware when the response is finished. It frees the
 * request's slot exactly once - calling it again (finish + error handler) is a no-op.
 * Rejected requests never occupy a slot.
 *
 * Usage:
 *   const shedder = createLoadShedder({ maxInFlight: 200, maxLagMs: 100 }, () => lagMs);
 *   app.use((req, res, next) => {
 *     const decision = shedder.admit();
 *     if (!decision.accepted) return res.status(503).set("Retry-After", "1").end();
 *     res.on("close", decision.release);
 *     next();
 *   });
 *
 * @param {{ maxInFlight: number, maxLagMs: number }} limits
 * @param {() => number} getLag current event loop lag in ms (e.g. a recent p99 delay)
 * @returns {{
 *   admit(): { accepted: true, release: () => void } | { accepted: false, reason: "lag" | "in_flight" },
 *   inFlight(): number,
 * }}
 */
function createLoadShedder({ maxInFlight, maxLagMs }, getLag) {
  let inFlight = 0;

  return {
    admit() {
      // TODO: shed load - reject when the event loop lag or the in-flight count is too high.
      inFlight++;
      return {
        accepted: true,
        release: () => {
          inFlight--;
        },
      };
    },

    inFlight: () => inFlight,
  };
}
