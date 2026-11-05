// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-k8s-2-3",
    title: "Horizontal Pod Autoscaler on real load",
    slug: { _type: "slug", current: "kubernetes-horizontal-pod-autoscaler-real-load" },
    description:
        "Rice Rocket's first autoscaler showed `<unknown>/70%` and never scaled, a release during the lunch peak cut 9 pods back to 3, and after the peak the pod count flapped every minute. Learn how the HorizontalPodAutoscaler computes the pod count (utilization of requests, tolerance, bounds), how its behavior windows stop flapping, and why the Deployment must stop setting replicas.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Orders arrive in two waves, around 11:00 and 18:00, with about three times the night traffic. The api ran a fixed 9 pods all day to survive the peaks, which wasted most of the cluster at night. The team added an autoscaler, and it failed three different ways in its first week.",
    },

    content: [
        h2("Situation"),
        p("The first attempt, applied by the release pipeline together with the Deployment:"),
        code("yaml", `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: rice-rocket
spec:
  replicas: 3
  # ... selector and template, the container has no resources: block
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api
  namespace: rice-rocket
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 3
  maxReplicas: 12
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 0`, "k8s/api.yaml"),
        bullets([
            "Day 1: `kubectl get hpa` showed `TARGETS <unknown>/70%` all day and 3 pods through the lunch peak. `kubectl describe hpa api` said `failed to get cpu utilization: missing request for cpu in container api`.",
            "Day 2, after adding a CPU request: the HPA reached 9 pods at 11:20. At 11:40 the pipeline applied a release and the Deployment dropped to 3 pods; p95 latency went from 180 ms to 2.4 s for two minutes.",
            "Day 3, evening: with load swinging minute by minute, the pod count went 6, 4, 7, 4, 7... and every new pod spent its first seconds cold.",
        ]),

        h2("The core you need"),
        bullets([
            "**The HPA resizes a workload on a metric.** `scaleTargetRef` names the Deployment; `minReplicas` and `maxReplicas` bound the count. It needs the Metrics Server (managed clusters ship it) to read pod CPU.",
            "**Utilization is a percentage of the request.** `type: Utilization, averageUtilization: 70` means \"average CPU use = 70% of `resources.requests.cpu`\". A container without a CPU request has no 100%, so the metric is `<unknown>` and nothing scales. `type: AverageValue` takes a quantity per pod instead (`averageValue: 175m`); a bare `70` there means 70 whole cores.",
            "**The formula.** Every 15 seconds: `desired = ceil(current x currentMetric / target)`, clamped to the bounds. Within 10% of the target (a ratio between 0.9 and 1.1) it keeps the count. 3 pods at 240% of their request against a 70% target want `ceil(3 x 240 / 70) = 11` pods.",
            "**`behavior` paces the changes.** `scaleUp.policies` cap how fast pods are added (`type: Percent, value: 100, periodSeconds: 60` = at most double per minute); `scaleDown.stabilizationWindowSeconds` makes the HPA use the highest recommendation of that window before removing pods (default 300 seconds). A window of 0 follows every dip and flaps.",
            "**One owner for the pod count.** Once an HPA scales a Deployment, `spec.replicas` in the manifest is a fight: every `kubectl apply` writes it back, and the HPA needs a while to correct it. Leave `replicas` out of the manifest and let the HPA own it.",
        ]),

        h2("Apply it in the project"),
        p("Each pod reserves 250m CPU, so 70% is 175m per pod; the night load of about 450m sits at 60% on 3 pods and the peak of 1.8 cores needs 11. The Deployment no longer sets `replicas`:"),
        code("yaml", `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: rice-rocket
spec:
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
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              memory: 512Mi
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api
  namespace: rice-rocket
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 3
  maxReplicas: 12
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100              # at most double the pods
          periodSeconds: 60       # per minute
    scaleDown:
      stabilizationWindowSeconds: 300   # remove pods after 5 calm minutes`, "k8s/api.yaml"),
        callout("info", "Why maxReplicas is 12 and not 50",
            "The bound protects what is behind the api: the managed Postgres accepts a fixed number of connections, and each api pod opens a pool of 10. Twelve pods use 120 of its 200 connections. Raise the bound only together with the database plan."),

        h2("Verify"),
        code("bash", `
kubectl apply -f k8s/api.yaml
kubectl get hpa api -n rice-rocket
# NAME   REFERENCE        TARGETS       MINPODS   MAXPODS   REPLICAS   AGE
# api    Deployment/api   cpu: 60%/70%  3         12        3          2m
kubectl get hpa api -n rice-rocket -w        # during the 11:00 peak
# api    Deployment/api   cpu: 240%/70%   3   12   3
# api    Deployment/api   cpu: 120%/70%   3   12   6
# api    Deployment/api   cpu: 65%/70%    3   12   11
kubectl describe hpa api -n rice-rocket | grep -A5 Events
#   Normal  SuccessfulRescale  New size: 6; reason: cpu resource utilization (percentage of request) above target
kubectl apply -f k8s/api.yaml && kubectl get deploy api -n rice-rocket   # still 11/11 during the peak`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Removing `replicas` from a file applied before.** Client-side `kubectl apply` remembers the last applied file in an annotation; when `replicas` disappears from the file, apply deletes the field and the Deployment drops to the default of 1 pod once. Run `kubectl apply edit-last-applied deployment/api` and delete `replicas` there first (or use `kubectl apply --server-side`), then apply the new file.",
            "**Requests set by guess.** The HPA scales on the request, not on the node: a request of 1 CPU for a pod that uses 200m keeps utilization at 20% and the HPA never adds pods. Compare `kubectl top pods` with the requests (lesson 5) before trusting the target.",
            "**Slow starts look like missing capacity.** A pod that needs 40 seconds to warm up adds no capacity during that time, and the HPA may add even more pods. Readiness probes (lesson 3) keep cold pods out of the Service, and the scaleUp policy keeps the jump in proportion.",
        ]),

        p("Now write the autoscaler. The editor holds `k8s/api.yaml` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first week's mistakes on purpose. Run replays a recorded day of load through a simulator of the autoscaler and reports the pod counts, the scale-downs and the minutes the pods ran above 90% of their CPU request."),
        challenge("chal_coding_k8s_162"),
    ],
});
