// Wrong variant: timeouts and fallbacks are right, but a failed REQUIRED source is only noticed
// after every other source has settled - the user stares at a skeleton for nothing.
async function loadDashboard(sources, timers) {
  const attempts = sources.map((source) => {
    const call = new Promise((resolve) => resolve(source.load()));
    if (typeof source.timeoutMs !== "number") return call;
    let id;
    const timeout = new Promise((_, reject) => { id = timers.setTimeout(() => reject(new Error("timeout")), source.timeoutMs); });
    return Promise.race([call, timeout]).finally(() => timers.clearTimeout(id));
  });
  const outcomes = await Promise.allSettled(attempts);
  const data = {};
  const errors = {};
  outcomes.forEach((outcome, i) => {
    const source = sources[i];
    if (outcome.status === "fulfilled") data[source.name] = outcome.value;
    else if (source.required) throw new Error(`${source.name}: ${outcome.reason.message}`);
    else {
      data[source.name] = source.fallback === undefined ? null : source.fallback;
      errors[source.name] = outcome.reason.message;
    }
  });
  return { data, errors };
}
