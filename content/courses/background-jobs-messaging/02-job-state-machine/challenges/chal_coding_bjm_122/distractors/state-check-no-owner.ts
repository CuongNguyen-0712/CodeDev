// @piece state-check: Find the job, check its state and worker
const job = jobs.get(event.jobId);
if (!job) return "unknown job";
if (!ALLOWED[event.type].includes(job.state)) return `${event.type} not allowed when ${job.state}`;
