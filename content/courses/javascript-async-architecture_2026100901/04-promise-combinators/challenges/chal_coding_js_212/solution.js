/**
 * Reference solution (never shipped to learners).
 */
async function loadDashboard(sources, timers) {
  function attempt(source) {
    // new Promise(...) turns a synchronous throw inside load() into a rejection.
    const call = new Promise((resolve) => resolve(source.load()));
    if (typeof source.timeoutMs !== "number") return call;

    let timerId;
    const timeout = new Promise((_, reject) => {
      timerId = timers.setTimeout(() => reject(new Error("timeout")), source.timeoutMs);
    });
    return Promise.race([call, timeout]).finally(() => timers.clearTimeout(timerId));
  }

  const attempts = sources.map(attempt);

  // Rejects as soon as one REQUIRED source fails; optional sources never reject here.
  const requiredGate = Promise.all(
    sources.map((source, i) =>
      source.required
        ? attempts[i].catch((error) => {
            throw new Error(`${source.name}: ${error.message}`);
          })
        : null,
    ),
  );

  const [outcomes] = await Promise.all([Promise.allSettled(attempts), requiredGate]);

  const data = {};
  const errors = {};
  outcomes.forEach((outcome, i) => {
    const { name, fallback } = sources[i];
    if (outcome.status === "fulfilled") {
      data[name] = outcome.value;
    } else {
      data[name] = fallback === undefined ? null : fallback;
      errors[name] = outcome.reason && outcome.reason.message ? outcome.reason.message : String(outcome.reason);
    }
  });
  return { data, errors };
}
