// @piece percentile: Nearest-rank percentile of sorted values
if (sorted.length === 0) return null;
return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
