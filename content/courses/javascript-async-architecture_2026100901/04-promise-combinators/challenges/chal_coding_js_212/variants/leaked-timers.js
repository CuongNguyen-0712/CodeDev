// Wrong variant: Promise.race against a timeout, but the timeout timer is never cleared.
// Every dashboard load leaves timers behind that fire long after the data arrived.
async function loadDashboard(sources, timers) {
  const attempts = sources.map((source) => {
    const call = new Promise((resolve) => resolve(source.load()));
    if (typeof source.timeoutMs !== "number") return call;
    const timeout = new Promise((_, reject) => { timers.setTimeout(() => reject(new Error("timeout")), source.timeoutMs); });
    return Promise.race([call, timeout]);
  });
  const gate = Promise.all(sources.map((source, i) =>
    source.required ? attempts[i].catch((e) => { throw new Error(`${source.name}: ${e.message}`); }) : null));
  const [outcomes] = await Promise.all([Promise.allSettled(attempts), gate]);
  const data = {};
  const errors = {};
  outcomes.forEach((outcome, i) => {
    const source = sources[i];
    if (outcome.status === "fulfilled") data[source.name] = outcome.value;
    else {
      data[source.name] = source.fallback === undefined ? null : source.fallback;
      errors[source.name] = outcome.reason.message;
    }
  });
  return { data, errors };
}
