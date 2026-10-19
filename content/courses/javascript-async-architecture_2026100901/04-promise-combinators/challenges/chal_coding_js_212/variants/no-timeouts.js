// Wrong variant: allSettled with fallbacks, but no timeouts. A hung or very slow optional
// source keeps the whole dashboard on its skeleton screen.
async function loadDashboard(sources, timers) {
  const outcomes = await Promise.allSettled(sources.map((source) => new Promise((resolve) => resolve(source.load()))));
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
