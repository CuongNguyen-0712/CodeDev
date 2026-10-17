/**
 * Returns the p-th percentile of a list of latency samples (milliseconds), using the
 * NEAREST-RANK definition:
 *
 *   1. sort a copy of the values in ascending NUMERIC order (do not modify `values`)
 *   2. rank = ceil(p / 100 * n), where n = values.length; if rank < 1, use rank = 1
 *   3. the result is the value at that 1-based rank: sorted[rank - 1]
 *
 * The result is always one of the observed samples (no interpolation).
 * An empty list has no percentile: return null.
 *
 * Examples: percentile([15, 20, 35, 40, 50], 30) -> 20   (rank = ceil(1.5) = 2)
 *           percentile([15, 20, 35, 40, 50], 100) -> 50
 *
 * @param {number[]} values latency samples in ms, in arrival order
 * @param {number} p        percentile, 0 <= p <= 100
 * @returns {number|null}
 */
function percentile(values, p) {
  // TODO: implement the nearest-rank percentile.
  // The dashboard currently shows the average, which hides the slow tail.
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
