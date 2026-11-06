// @piece retry-after: Reject with an estimate of when to retry
this.totals[job.priority].rejected++;
const sumMs = this.recent.length > 0 ? this.recent.reduce((a, b) => a + b, 0) : this.config.defaultGradeMs;
const count = Math.max(1, this.recent.length);
const excess = depth;
return { status: 429, retryAfterSec: Math.ceil((excess * sumMs) / (count * this.config.workers * 1000)) };
