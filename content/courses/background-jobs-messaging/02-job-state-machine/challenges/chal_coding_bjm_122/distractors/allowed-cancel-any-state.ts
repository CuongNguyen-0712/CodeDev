// @piece allowed-table: Which events each state allows
const ALLOWED: Record<JobEvent["type"], JobState[]> = {
    enqueue: [],
    start: ["queued", "retrying"],
    heartbeat: ["running"],
    succeed: ["running"],
    fail: ["running"],
    timeout: ["running"],
    cancel: ["queued", "running", "retrying", "succeeded", "failed"],
    "retry-scheduled": ["failed"],
};
