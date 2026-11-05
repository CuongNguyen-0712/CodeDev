// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-k8s-2-1",
    title: "Rolling updates, maxSurge and rollbacks",
    slug: { _type: "slug", current: "kubernetes-rolling-updates-maxsurge-rollbacks" },
    description:
        "A lunch-time release took Rice Rocket's api from 6 serving pods to 5, a crashing image shipped as `latest`, and a stuck rollout hung the pipeline for 10 minutes. Learn how the Deployment controller replaces pods (maxSurge, maxUnavailable, minReadySeconds), how it reports a stuck rollout, and how to roll back to a version you can name.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The api runs on the cluster as a 6-replica Deployment, and the lunch peak needs all 6. Releases go out with `kubectl apply` from the CI pipeline. Three releases in one week went wrong in three different ways, and each time the team could not say quickly which version was running or how to get the previous one back.",
    },

    content: [
        h2("Situation"),
        p("This is the Deployment the pipeline applies. The CI job replaces the image line and runs `kubectl apply -f k8s/api-deployment.yaml`:"),
        code("yaml", `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: rice-rocket
spec:
  replicas: 6
  revisionHistoryLimit: 0
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: ghcr.io/rice-rocket/api:latest
          ports:
            - name: http
              containerPort: 3000
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            periodSeconds: 5`, "k8s/api-deployment.yaml"),
        bullets([
            "Monday 12:05: a release during the lunch peak. `kubectl get rs` showed 5 old pods ready and 3 new pods starting; p95 latency doubled until the rollout finished.",
            "Wednesday: image 1.5.0 crashed on start. The tag in the manifest was `latest`, so `kubectl describe` did not say which build was running, and `kubectl rollout undo` answered `no rollout history found` because `revisionHistoryLimit: 0` deletes every old ReplicaSet.",
            "Friday: `kubectl rollout status` in the pipeline waited 10 minutes on a pod that never became ready, then the CI job timed out without saying why.",
        ]),

        h2("The core you need"),
        bullets([
            "**A rollout is two ReplicaSets.** Changing the pod template (here, the image) creates a new ReplicaSet; the Deployment controller scales it up and the old one down. The old ReplicaSet stays at 0 replicas as a revision you can return to.",
            "**`maxSurge` and `maxUnavailable` set the pace.** `maxSurge` is how many pods may exist above `replicas`; `maxUnavailable` is how many of `replicas` may be unavailable. Both take a number or a percentage; a percentage of `maxSurge` rounds **up**, of `maxUnavailable` rounds **down**. The defaults are 25% and 25%: with 6 replicas, up to 8 pods and as few as 5 available. `maxSurge: 1, maxUnavailable: 0` adds one pod, waits until it is available, removes one old pod, and repeats. Both 0 is rejected, since nothing could move.",
            "**Available means ready for long enough.** A pod is ready when its readiness probe passes; it is available after it stayed ready for `minReadySeconds` (default 0). A pod that crashes 5 seconds after its first good probe never counts with `minReadySeconds: 10`.",
            "**A stuck rollout is reported, not undone.** If the rollout makes no progress for `progressDeadlineSeconds` (default 600), the `Progressing` condition turns `False` with reason `ProgressDeadlineExceeded` and `kubectl rollout status` exits non-zero. Kubernetes does not roll back by itself; the pipeline or a person runs `kubectl rollout undo`.",
            "**History you can name.** `revisionHistoryLimit` (default 10) is how many old ReplicaSets are kept for `kubectl rollout undo`. Each revision is only as useful as its image tag: `1.5.1` or a digest names one build, `latest` names whatever was pushed last. The `kubernetes.io/change-cause` annotation shows in `kubectl rollout history`.",
        ]),

        h2("Apply it in the project"),
        p("The CI course already tags every image with its version. The Deployment now rolls out one pod at a time, counts a pod after 10 seconds of readiness, reports a stuck rollout after 5 minutes and keeps 5 revisions:"),
        code("yaml", `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: rice-rocket
  annotations:
    kubernetes.io/change-cause: "api 1.5.1: retry MoMo payment webhooks"
spec:
  replicas: 6
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # one extra pod during the rollout
      maxUnavailable: 0    # never fewer than 6 serving
  minReadySeconds: 10
  progressDeadlineSeconds: 300
  revisionHistoryLimit: 5
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: ghcr.io/rice-rocket/api:1.5.1
          ports:
            - name: http
              containerPort: 3000
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            periodSeconds: 5`, "k8s/api-deployment.yaml"),
        p("The deploy step waits for the rollout and rolls back when it fails, so a bad release never stays half-done:"),
        code("bash", `
kubectl apply -f k8s/api-deployment.yaml
if ! kubectl rollout status deployment/api -n rice-rocket --timeout=6m; then
  kubectl rollout undo deployment/api -n rice-rocket
  kubectl rollout status deployment/api -n rice-rocket --timeout=6m
  exit 1
fi`, "deploy/rollout.sh"),
        callout("info", "Why one extra pod and not more",
            "Each surge pod needs room on a node. With `maxSurge: 1` the cluster needs spare capacity for one api pod (its requests, lesson 5), and a rollout of 6 pods takes about 6 x (start time + 10 s). A larger surge is faster but needs more spare room; `maxUnavailable` above 0 is faster too, but only outside the peaks."),

        h2("Verify"),
        code("bash", `
kubectl apply -f k8s/api-deployment.yaml
kubectl rollout status deployment/api -n rice-rocket
# Waiting for deployment "api" rollout to finish: 1 out of 6 new replicas have been updated...
# ...
# deployment "api" successfully rolled out
kubectl get rs -n rice-rocket -l app=api       # old ReplicaSet at 0, new one at 6/6
kubectl rollout history deployment/api -n rice-rocket
# REVISION  CHANGE-CAUSE
# 7         api 1.5.0: new courier tracking
# 8         api 1.5.1: retry MoMo payment webhooks
kubectl rollout undo deployment/api -n rice-rocket --to-revision=7   # back to a named version`, "terminal"),
        p("During the rollout, `kubectl get deploy api -n rice-rocket -w` never shows `AVAILABLE` below 6."),

        h2("Pitfalls"),
        bullets([
            "**`latest` and `imagePullPolicy`.** With a `latest` tag, re-applying the same manifest changes nothing (the template did not change), and nodes may run different builds pulled at different times. Detect it with `kubectl get pods -o jsonpath='{..imageID}'` showing several digests for one tag; fix it with a version tag or a digest.",
            "**`kubectl apply` resets an undo.** `kubectl rollout undo` changes the live Deployment, not the file in git. The next `kubectl apply` of the file ships the bad version again. After an undo, fix the image line in the repository as well.",
            "**No readiness probe, no protection.** Without a readiness probe a pod is ready as soon as its container starts, so `maxUnavailable: 0` happily removes old pods for new ones that cannot serve. Check that `kubectl describe pod` lists `Readiness:` for the api container (lesson 3).",
        ]),

        challenge("chal_quiz_k8s_141"),
        p("Now make the api rollout safe. The editor holds the Deployment with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat this week's mistakes on purpose. Run rolls out a healthy image and a never-ready one with a simulator of the Deployment controller and reports the pod counts it saw."),
        challenge("chal_coding_k8s_142"),
    ],
});
