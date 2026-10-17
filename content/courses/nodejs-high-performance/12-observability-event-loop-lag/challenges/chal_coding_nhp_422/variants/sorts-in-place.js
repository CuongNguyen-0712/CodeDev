// Wrong variant: correct math, but sorts the caller's array in place - the raw samples
// (in arrival order) are destroyed for every later consumer.
function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = values.sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}
