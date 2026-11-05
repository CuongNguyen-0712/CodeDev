// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-k8s-2-2",
    title: "Requests, limits and OOMKilled",
    slug: { _type: "slug", current: "kubernetes-requests-limits-oomkilled" },
    description:
        "Rice Rocket's api pods piled onto one node, died with exit code 137 during the monthly report export, and slowed down under a CPU limit while the node sat idle. Learn what the scheduler adds up, what the kernel does at a memory limit and at a CPU limit, how QoS classes decide who is evicted first, and assemble a planner that predicts all of it for one node.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The api and the courier-matcher worker run in the namespace `rice-rocket` on two nodes of 2 vCPU and 4 GiB each (1930m CPU and 3.3Gi memory allocatable after the system reserve). The manifests from lesson 1 set no `resources:` at all. On the first of the month the report export ran inside the api, and the night went badly three ways.",
    },

    content: [
        h2("Situation"),
        p("What the on-call engineer saw between 02:00 and 02:30:"),
        code("text", `
$ kubectl get pods -o wide -n rice-rocket
NAME                               READY   STATUS             RESTARTS      NODE
api-5c9d7f6b8-2xkqz                1/1     Running            0             pool-a-1
api-5c9d7f6b8-7hd2m                0/1     CrashLoopBackOff   3 (40s ago)   pool-a-1
api-5c9d7f6b8-9pq4r                1/1     Running            0             pool-a-1
courier-matcher-6f7c9d5d4b-qm2zk   0/1     Evicted            0             pool-a-1

$ kubectl get pod api-5c9d7f6b8-7hd2m -o jsonpath='{.status.containerStatuses[0].lastState}'
{"terminated":{"exitCode":137,"reason":"OOMKilled"}}

$ kubectl top nodes
NAME       CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
pool-a-1   1810m        93%    3301Mi          97%
pool-a-2   95m          4%     610Mi           18%`, "terminal"),
        bullets([
            "Every api pod landed on pool-a-1 while pool-a-2 idled at 4% CPU.",
            "An api container was killed with exit code 137 and restarted three times; the export never finished.",
            "Earlier, a teammate had tried `limits: { cpu: 500m }` on the api: p99 latency went from 120 ms to 900 ms although the node had spare CPU.",
            "Under memory pressure the kubelet evicted courier-matcher, so orders stopped being matched to couriers.",
        ]),

        h2("The core you need"),
        bullets([
            "**Requests are what the scheduler counts.** It binds a pod to a node only if the sum of the requests of the pods already there, plus this one, fits the node's allocatable. It never reads live usage and never moves a running pod. No request means zero: five pods without requests all fit on one node.",
            "**Limits are what the kernel enforces.** A container whose memory goes over `limits.memory` is killed by the OOM killer: `reason: OOMKilled`, exit code 137 (128 + SIGKILL), then restarted. A container at `limits.cpu` is **throttled** by the CFS quota: slower, never killed.",
            "**A limit alone is also the request.** When a container sets `limits.memory: 512Mi` and no request, Kubernetes sets the request to 512Mi too.",
            "**QoS class per pod.** `Guaranteed`: every container has CPU and memory limits and its requests equal them. `BestEffort`: no container sets any request or limit. Everything else is `Burstable`.",
            "**Eviction under node pressure.** When the node runs low on memory, the kubelet evicts pods whose usage is above their memory request first, then lower priority first, then the largest usage above request. A `BestEffort` pod requests nothing, so any usage is above its request; a `Guaranteed` pod within its limit goes last.",
            "**Units.** CPU: `250m` is a quarter core, `1` is one core. Memory: `Mi`, `Gi` are powers of 1024; `M`, `G` are powers of 1000. `512M` is about 488Mi, a classic surprise when a limit is copied from a dashboard.",
        ]),

        h2("Apply it in the project"),
        p("Measure first: `kubectl top pod --containers` over a normal day and during the export gives the steady usage and the peak. The api uses about 150m CPU and 300Mi on a normal day, and the export peaked at 700Mi:"),
        code("yaml", `
          resources:
            requests:
              cpu: 250m          # steady usage plus headroom: what the scheduler reserves
              memory: 512Mi
            limits:
              memory: 768Mi      # above the export peak; a leak still ends in OOMKilled, not a dead node
              # no cpu limit: at a busy moment the api may use idle CPU instead of being throttled`, "k8s/api-deployment.yaml (container api)"),
        p("courier-matcher must keep running when memory gets tight, so it gets equal requests and limits (`Guaranteed`) and a higher priority:"),
        code("yaml", `
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: rice-rocket-critical
value: 1000
description: Matching orders to couriers; evicted last.
---
# in the courier-matcher Deployment, pod spec:
      priorityClassName: rice-rocket-critical
      containers:
        - name: matcher
          resources:
            requests: { cpu: 200m, memory: 256Mi }
            limits:   { cpu: 200m, memory: 256Mi }`, "k8s/courier-matcher.yaml"),
        p("And the report export leaves the api: it becomes a Job with its own memory budget (lesson 9), so a big month cannot take orders down with it."),
        callout("info", "Why no CPU limit on the api",
            "A CPU limit caps a container even when the node is idle, and latency-sensitive services pay for it in throttled periods. The request already guarantees the api its share when the node is busy. Keep CPU limits for batch work you want to fence in; always keep a memory limit."),

        h2("Verify"),
        code("bash", `
kubectl apply -f k8s/ -n rice-rocket
kubectl get pods -n rice-rocket -o wide                 # api pods spread over pool-a-1 and pool-a-2
kubectl describe node pool-a-1 | sed -n '/Allocated resources/,/Events/p'
#   Resource  Requests      Limits
#   cpu       700m (36%)    200m (10%)
#   memory    1280Mi (37%)  1792Mi (53%)
kubectl get pod -n rice-rocket -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass
# api-...               Burstable
# courier-matcher-...   Guaranteed
kubectl get pod -n rice-rocket -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.containerStatuses[0].lastState.terminated.reason}{"\\n"}{end}'
# no OOMKilled after the next export run`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Requests copied from limits \"to be safe\".** Requests of 2Gi on a pod that uses 300Mi reserve memory nobody uses: new pods go Pending with `0/2 nodes are available: 2 Insufficient memory` while `kubectl top` shows half-empty nodes. Detect it by comparing `kubectl describe node` (Allocated resources) with `kubectl top node`.",
            "**Reading OOMKilled as an app crash.** An OOM-killed process is killed by the kernel and usually writes nothing to its log. Check `lastState.terminated.reason` before you search the logs; `reason: Evicted` on a pod is the node, not the container limit.",
            "**`M` where you meant `Mi`.** `limits.memory: 512M` is 512,000,000 bytes, about 24Mi less than `512Mi`. A container sized close to its limit gets OOMKilled for a reason nobody can see in the YAML. Use `Mi`/`Gi` everywhere and grep for `[0-9]M\"\\?$` in reviews.",
        ]),

        challenge("chal_quiz_k8s_151"),
        p("Now assemble the capacity planner the team uses before changing `resources:`. The editor starts from `plan-node.js` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the night's misconceptions on purpose. Run checks it against scripted nodes: scheduling, QoS classes, OOMKilled versus throttling, units and eviction order."),
        challenge("chal_coding_k8s_152"),
    ],
});
