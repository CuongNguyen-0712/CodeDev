// runbooks/triage.js: the first answer the on-call bot posts when a Rice Rocket pod is not ready.
// It is fed the output of three commands:
//   pod:    kubectl get pod <name> -n rice-rocket -o json
//   events: kubectl get events -n rice-rocket --field-selector involvedObject.name=<name> -o json (.items, oldest first)
//   logs:   { current: kubectl logs <name> -c <container>, previous: the same with --previous }
// return: { cause, evidence, next } for the first container that is not ready:
//   "ImagePullBackOff" | "CreateContainerConfigError" | "OOMKilled" | "LivenessProbe" | "AppError" | "Starting" | "Healthy"
function triage(pod, events, logs) {
    const statuses = (pod.status && pod.status.containerStatuses) || [];
    // @piece pick-container: The first container that is not ready, or Healthy
    const status = statuses.find((s) => !s.ready);
    if (!status) return { cause: "Healthy", evidence: "all containers ready", next: "nothing to do" };
    // @end
    const waiting = (status.state && status.state.waiting) || null;
    const last = (status.lastState && status.lastState.terminated) || null;

    // @piece waiting-reasons: Containers that never started: image or config
    if (waiting && (waiting.reason === "ImagePullBackOff" || waiting.reason === "ErrImagePull")) {
        return { cause: "ImagePullBackOff", evidence: waiting.message, next: NEXT.ImagePullBackOff };
    }
    if (waiting && waiting.reason === "CreateContainerConfigError") {
        return { cause: "CreateContainerConfigError", evidence: waiting.message, next: NEXT.CreateContainerConfigError };
    }
    // @end
    // @piece oom-killed: The last run was killed at its memory limit
    if (last && last.reason === "OOMKilled") {
        return {
            cause: "OOMKilled",
            evidence: `exit code ${last.exitCode} (OOMKilled) after ${status.restartCount} restarts`,
            next: NEXT.OOMKilled,
        };
    }
    // @end
    // @piece liveness-kill: The kubelet restarted it after failed liveness probes
    const killed = events.some((e) => e.reason === "Killing" && /failed liveness probe/.test(e.message));
    if (killed) {
        const probe = events.filter((e) => /^Liveness probe failed/.test(e.message)).pop();
        return { cause: "LivenessProbe", evidence: probe ? probe.message : "failed liveness probe", next: NEXT.LivenessProbe };
    }
    // @end
    if (last || status.restartCount > 0) {
        // @piece app-error-evidence: Why the app exited: the log of the run that died
        const line = lastLine(logs.previous);
        return { cause: "AppError", evidence: line || `exit code ${last ? last.exitCode : "unknown"}`, next: NEXT.AppError };
        // @end
    }
    // Not ready and never restarted: still being created or still starting up.
    return { cause: "Starting", evidence: waiting ? waiting.reason : "running, not ready yet", next: NEXT.Starting };
}

const NEXT = {
    ImagePullBackOff: "fix the image name or tag, or the pull secret, then roll out again",
    CreateContainerConfigError: "fix the ConfigMap or Secret the pod refers to; a restart will not help",
    OOMKilled: "raise limits.memory or fix the memory growth; compare with kubectl top pod",
    LivenessProbe: "check the liveness probe path, port and timing against the app's startup",
    AppError: "fix the error from the previous container's log",
    Starting: "wait for the readiness probe; describe the pod if it stays not ready",
};

// The last non-empty line of a log, trimmed; "" when there is none.
function lastLine(text) {
    const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    return lines.length ? lines[lines.length - 1] : "";
}
