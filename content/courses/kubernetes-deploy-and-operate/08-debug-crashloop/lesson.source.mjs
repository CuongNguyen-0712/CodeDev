// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-k8s-3-2",
    title: "Debugging CrashLoopBackOff from status, events and logs",
    slug: { _type: "slug", current: "kubernetes-debug-crashloopbackoff" },
    description:
        "Rice Rocket's on-call bot answered four incidents with the wrong advice: an empty log, an OOM kill called an app crash, a missing image and a missing Secret key it never saw, and liveness kills it never noticed. Learn where a pod records what happened - container state, last state, restart count, events, the previous container's log - and fix the triage script so it reads them in the right order.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "When an api pod in the namespace `rice-rocket` stops being ready, a bot runs `runbooks/triage.js` and posts a cause and a next step in the incident channel. People trust it at 3 a.m., and last week it was wrong four times.",
    },

    content: [
        h2("Situation"),
        p("The core of last week's script, and what it posted:"),
        code("js", `
function triage(pod, events, logs) {
    const status = pod.status.containerStatuses[0];
    const t = status.state.terminated;              // what the container is doing now
    if (t && t.reason === "ImagePullBackOff") return { cause: "ImagePullBackOff" };
    if (status.restartCount > 0) {
        return { cause: "AppError", evidence: logs.current.split("\\n").pop() };
    }
    return { cause: "Healthy" };
}`, "runbooks/triage.js (last week)"),
        bullets([
            "`AppError`, evidence `{\"msg\":\"loading config\"}`: the api had been OOM-killed during the report export, and the quoted line came from the fresh container, not the one that died.",
            "`Healthy` for a pod stuck on `ImagePullBackOff` after CI pushed `api:1.5.1` under another name, and again for `CreateContainerConfigError` after a Secret was recreated with `db-password` instead of `db_password`.",
            "`AppError` for an api that the kubelet killed every two minutes for failing its liveness probe; the reason was only in the events.",
            "On a pod with the log-shipper sidecar first, it looked at the sidecar and called the pod healthy.",
        ]),

        h2("The core you need"),
        bullets([
            "**Phase is not the answer.** A crash-looping pod is often `phase: Running`. Look at each entry of `status.containerStatuses`: `ready`, `restartCount`, `state` and `lastState`.",
            "**`state` is now, `lastState` is the last run.** `state.waiting.reason` says why the container is not running now: `ImagePullBackOff`/`ErrImagePull` (the image cannot be pulled), `CreateContainerConfigError` (a referenced ConfigMap, Secret or key is missing), `CrashLoopBackOff` (it keeps exiting). `lastState.terminated` holds the `exitCode` and `reason` of the run that died.",
            "**CrashLoopBackOff is a back-off, not a cause.** The kubelet waits 10s, 20s, 40s and so on, capped at 5 minutes, between restarts of a container that keeps exiting. The cause is in `lastState` and the events.",
            "**Exit codes.** 1 (or any small number): the app exited with an error. 137 = 128 + SIGKILL: with `reason: OOMKilled` the memory limit, otherwise usually a kill after the grace period. 143 = 128 + SIGTERM: asked to stop, for example by a failed liveness probe or a rollout.",
            "**Events say what the kubelet did.** `kubectl get events --field-selector involvedObject.name=<pod>` shows `Unhealthy` (`Liveness probe failed: ...`), `Killing` (`Container api failed liveness probe, will be restarted`), `Failed` (pull and config errors), `BackOff`. Events expire after about an hour.",
            "**Two logs per container.** `kubectl logs <pod> -c api` is the current run; `--previous` is the run that died. An OOM-killed process usually writes nothing about it.",
        ]),

        h2("Apply it in the project"),
        p("The order the on-call engineer follows by hand, in the order the script should follow too:"),
        code("bash", `
POD=api-7b9c6d5f4-k2x8p
kubectl get pod $POD -n rice-rocket -o jsonpath='{range .status.containerStatuses[*]}{.name}{" ready="}{.ready}{" restarts="}{.restartCount}{" state="}{.state}{" last="}{.lastState}{"\\n"}{end}'
kubectl get events -n rice-rocket --field-selector involvedObject.name=$POD --sort-by=.lastTimestamp
kubectl logs $POD -n rice-rocket -c api --previous --tail=30
# distroless image, no shell inside: attach a debug container that shares the process namespace
kubectl debug -it $POD -n rice-rocket --image=busybox:1.37 --target=api -- sh`, "terminal"),
        p("The fixed script picks the first container that is not ready, then reads the waiting reason, the last state, the events and only then the previous log:"),
        code("js", `
const status = statuses.find((s) => !s.ready);              // skip the ready sidecar
const waiting = status.state.waiting;                       // never started: image, config
const last = status.lastState.terminated;                   // the run that died: OOMKilled?
const killed = events.some((e) => e.reason === "Killing" && /failed liveness probe/.test(e.message));
const line = lastLine(logs.previous);                       // the log of the run that died`, "runbooks/triage.js (excerpt)"),
        callout("info", "Why the bot reads events at all",
            "A liveness kill ends with exit code 137 or 143 and `reason: Error`: from the container status alone it looks like any crash. Only the `Killing` event says the kubelet did it, and the `Unhealthy` events say which probe answer it did not like."),

        h2("Verify"),
        code("bash", `
node runbooks/triage.js api-7b9c6d5f4-k2x8p
# cause:    OOMKilled
# evidence: exit code 137 (OOMKilled) after 4 restarts
# next:     raise limits.memory or fix the memory growth; compare with kubectl top pod
node runbooks/triage.js api-6d8f7c9b5-zt4qw
# cause:    CreateContainerConfigError
# evidence: couldn't find key db_password in Secret rice-rocket/api-secrets`, "terminal"),
        p("Replay last week's four incidents from their saved JSON (`kubectl get pod -o json` and the events were attached to each incident ticket) and compare with what really happened."),

        h2("Pitfalls"),
        bullets([
            "**Deleting the pod to \"fix\" it.** The Deployment creates a new pod from the same template: same image, same Secret reference, same probe. Save `kubectl get pod -o yaml`, the events and `logs --previous` first; they are gone with the pod.",
            "**Waiting for events that expired.** Events are kept for about an hour. For a crash that started overnight, `lastState` and `--previous` are what is left; ship events to your log store if you need them later.",
            "**A liveness probe that checks the database.** When Postgres is slow, every api pod fails liveness and gets restarted at once, which makes the outage worse. If the triage says `LivenessProbe` for many pods at the same time, look at the probe (lesson 3) before the app.",
        ]),

        challenge("chal_quiz_k8s_181"),
        p("Now fix the triage script. The editor starts from the fixed `runbooks/triage.js` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are last week's buggy versions on purpose. Run feeds it the recorded pods, events and logs of real incidents."),
        challenge("chal_coding_k8s_182"),
    ],
});
