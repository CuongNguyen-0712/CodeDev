// @piece admit-job: Accept the job while the queue is under its bound
const depth = this.depth();
const threshold = this.config.limit;
if (depth < threshold) {
    this.waiting[job.priority].push({ job, acceptedAt: now });
    this.totals[job.priority].accepted++;
    return { status: 202, depth: depth + 1 };
}
