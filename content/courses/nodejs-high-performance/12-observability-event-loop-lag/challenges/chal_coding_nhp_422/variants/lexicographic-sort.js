// Wrong variant: default sort() compares strings, so 1200 sorts before 35.
function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort();
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}
