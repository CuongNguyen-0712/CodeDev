// @piece oom-killed: The last run was killed at its memory limit
const now = (status.state && status.state.terminated) || null;
if (now && now.reason === "OOMKilled") {
    return {
        cause: "OOMKilled",
        evidence: `exit code ${now.exitCode} (OOMKilled) after ${status.restartCount} restarts`,
        next: NEXT.OOMKilled,
    };
}
