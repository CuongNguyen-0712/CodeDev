// @piece p75: The 75th percentile value (nearest rank)
const values = samples.map((s) => s.value).sort((a, b) => a - b);
const p75 = Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 1000) / 1000;
