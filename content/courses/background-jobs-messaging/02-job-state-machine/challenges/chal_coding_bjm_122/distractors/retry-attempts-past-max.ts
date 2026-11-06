// @piece retry-effects: Schedule a retry, if one is left
case "retry-scheduled":
    if (job.lastFailure === "permanent") return "permanent failure";
    if (job.attempts > maxAttempts) return "max attempts reached";
    job.state = "retrying";
    return null;
