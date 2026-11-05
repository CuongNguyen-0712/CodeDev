// runbooks/triage.js: the first answer the on-call bot posts when a Rice Rocket pod is not ready.
// It is fed the output of three commands:
//   pod:    kubectl get pod <name> -n rice-rocket -o json
//   events: kubectl get events -n rice-rocket --field-selector involvedObject.name=<name> -o json (.items, oldest first)
//   logs:   { current: kubectl logs <name> -c <container>, previous: the same with --previous }
// return: { cause, evidence, next } for the first container that is not ready:
//   "ImagePullBackOff" | "CreateContainerConfigError" | "OOMKilled" | "LivenessProbe" | "AppError" | "Starting" | "Healthy"
function triage(pod, events, logs) {
    const statuses = (pod.status && pod.status.containerStatuses) || [];
    // [ ] The first container that is not ready, or Healthy
    const waiting = (status.state && status.state.waiting) || null;
    const last = (status.lastState && status.lastState.terminated) || null;

    // [ ] Containers that never started: image or config
    // [ ] The last run was killed at its memory limit
    // [ ] The kubelet restarted it after failed liveness probes
    if (last || status.restartCount > 0) {
        // [ ] Why the app exited: the log of the run that died
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
