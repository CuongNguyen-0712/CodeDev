// Wrong variant: Promise.all over every source. One optional failure (offers -> HTTP 500)
// rejects the whole dashboard - the original incident.
async function loadDashboard(sources, timers) {
  const values = await Promise.all(sources.map((source) => source.load()));
  const data = {};
  sources.forEach((source, i) => { data[source.name] = values[i]; });
  return { data, errors: {} };
}
