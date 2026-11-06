// @piece fresh-hit: Fresh: answer from the cache
if (entry && age <= this.maxAge) return { status: "HIT", value: entry.value, error: null, fetchesStarted: 0 };
