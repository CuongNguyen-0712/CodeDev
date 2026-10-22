// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-devf-3-3",
    title: "Deploys & rollbacks: blue-green and canary",
    slug: { _type: "slug", current: "devops-deploys-rollbacks-blue-green-canary" },
    description:
        "Rice Rocket's checkout v2.14.0 went to a 10% canary, the error rate was six times the baseline, and someone promoted it anyway because the dashboard looked about the same. Rolling back then took 40 minutes: the old image had been overwritten by the latest tag, and the release had renamed a database column the old version still read. Learn the four ways to replace a running version (recreate, rolling, blue-green, canary), readiness and liveness checks, immutable tags and image digests, expand-and-contract migrations, and an automated canary gate that decides with numbers instead of a glance.",
    estimatedTime: 24,

    scenario: {
        role: "Junior DevOps engineer on the on-call rotation at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "At 11:40 on a Friday, checkout v2.14.0 was sent to 10% of traffic. Twenty minutes later the canary had 24 errors in 1000 requests while the old version had 36 errors in 9000. A teammate looked at the two error counters, saw 24 next to 36, decided the canary was fine and moved it to 100%. Lunch orders started failing. The rollback should have taken a minute, but the Deployment used checkout:latest, which now pointed to v2.14.0, and the release had renamed orders.customer_phone, so even the old code could not run. It took 40 minutes to find yesterday's image and add the column back.",
    },

    content: [
        h2("1. The incident"),
        p("Rice Rocket ships checkout through a canary: a small share of real traffic goes to the new version first, the rest stays on the current one. The plan for v2.14.0 was 10% for twenty minutes, then 100%. Three things turned a normal bad release into a 40-minute outage:"),
        bullets([
            "**The canary was judged by eye.** The dashboard showed 24 errors for the canary and 36 for the old version. 24 looks smaller - but the canary served 1000 requests and the old version 9000. As rates, that is **2.40%** against **0.40%**: six times worse. Nobody did the division, so the release was promoted.",
            "**The previous version could not be found.** The Deployment said `image: ghcr.io/ricerocket/checkout:latest`. Every merge to `main` pushes a new image under `latest`, so the name now meant v2.14.0. \"Roll back to the old image\" had no name to roll back to; someone had to dig the old digest out of CI logs.",
            "**The old code could not run on the new schema.** v2.14.0's migration renamed `orders.customer_phone` to `orders.phone`. Once it ran, every v2.13 pod failed on `column \"customer_phone\" does not exist` - the canary's 90% \"safe\" side included. A code rollback alone could not fix that.",
        ]),
        p("Each of these is a habit you can fix: decide promotions with numbers, deploy artifacts that never change, and change the database in steps that both versions survive. This lesson goes through all three."),

        h2("2. Reproduce it"),
        p("You can watch a mutable tag lose your rollback target on your laptop. This needs only Docker; `busybox` is a 4 MB image:"),
        code("bash", `
mkdir tag-demo && cd tag-demo
printf 'FROM busybox:1.37\\nCMD ["echo", "checkout v2.13.4"]\\n' > Dockerfile
docker build -q -t checkout:latest .        # Thursday's release
docker run --rm checkout:latest
# checkout v2.13.4

printf 'FROM busybox:1.37\\nCMD ["echo", "checkout v2.14.0"]\\n' > Dockerfile
docker build -q -t checkout:latest .        # Friday's release, same tag
docker run --rm checkout:latest
# checkout v2.14.0

docker image ls checkout`, "tag-demo.sh"),
        p("The listing shows one `checkout:latest` - Friday's. Thursday's image still exists on this machine for now, but it has lost its name: a plain `docker image ls` shows it as `<none>` (a \"dangling\" image), and the next `docker image prune` deletes it. On a server that pulls from a registry, the old image is simply whatever the registry still keeps under some other name, if anything."),
        p("Now imagine the Kubernetes version. `kubectl rollout undo deployment/checkout` goes back to the previous **pod template**. If both the old and the new template say `checkout:latest`, the undo produces exactly the same template - and the nodes pull the same broken image again."),

        h2("3. Four ways to replace a running version"),
        p("A **deploy** puts a new version on servers. A **release** sends users to it. The strategies differ in how much traffic moves at once and how fast you can go back:"),
        bullets([
            "**Recreate**: stop every old instance, then start the new ones. Simple, and the only option when two versions must never run together - but users get errors or a maintenance page in between, and a rollback is another full stop-and-start.",
            "**Rolling update**: replace instances a few at a time. Kubernetes Deployments do this by default (`maxSurge: 25%`, `maxUnavailable: 25%`). No downtime and no extra servers, but for a while **old and new run side by side**, and a bad version reaches everybody as the roll continues.",
            "**Blue-green**: run the new version as a complete second environment (green) next to the live one (blue), test it with no users, then switch the router. Rollback is switching back, in seconds - as long as you keep blue running. It costs double capacity during the switch, and every user moves at once.",
            "**Canary**: send a small share of traffic (1%, 5%, 25% ...) to the new version, compare it with the old one, and grow the share only while the numbers look healthy. A bad release hurts a few percent of users for a few minutes. It needs good metrics, and enough traffic to judge.",
        ]),
        image("blue-green-and-canary", {
            alt: "Two panels. Top panel, Blue-green: Users send 100% of traffic to a router (load balancer). A solid blue arrow goes from the router to Blue, v2.13.4, live, which serves every request today; a dashed grey line goes to Green, v2.14.0, idle, deployed and smoke-tested with no users. A note says: release means pointing the router at green, all users move in one step; rollback means pointing it back at blue, which takes seconds as long as blue is kept; the cost is twice the servers for a while. Bottom panel, Canary: a growing share of traffic goes to the new version, and a gate compares canary with baseline after every step. Four boxes in a row - 5% canary v2.14.0, 25%, 50%, and 100% promoted - are joined by green arrows labelled gate. A note says each gate compares the canary with the baseline, the old version over the same minutes: first, enough canary requests to judge, otherwise HOLD; second, error rate and p95 close enough to the baseline, otherwise ROLLBACK. A red box says rollback at any gate sends the canary share back to v2.13.4, and only 5 to 50% of users ever saw the bug.",
            caption: "Both strategies keep the old version running, so rolling back is a traffic change. Canary adds a measured gate between steps.",
        }),
        p("A rolling update in Kubernetes is configured on the Deployment. This one never drops below four ready pods and adds one new pod at a time:"),
        code("yaml", `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # at most 1 pod above replicas during the roll
      maxUnavailable: 0    # never fewer than 4 ready pods
  template:
    spec:
      containers:
        - name: checkout
          image: ghcr.io/ricerocket/checkout:v2.14.0`, "deployment.yaml"),
        callout("info", "Deploy is not release",
            "Keeping the two words apart helps. Blue-green and canary deploy the new version first and release it later, with a separate decision. A rolling update deploys and releases in the same motion, which is why it needs good health checks."),

        h2("4. Health checks: readiness and liveness"),
        p("Every strategy above moves traffic only to instances that say they are ready. Kubernetes asks two different questions, and mixing them up causes outages of its own:"),
        code("yaml", `
containers:
  - name: checkout
    image: ghcr.io/ricerocket/checkout:v2.14.0
    readinessProbe:            # "may I send you traffic?"
      httpGet: { path: /ready, port: 8080 }
      periodSeconds: 5
      failureThreshold: 3
    livenessProbe:             # "are you stuck and need a restart?"
      httpGet: { path: /healthz, port: 8080 }
      periodSeconds: 10
      failureThreshold: 3`, "deployment.yaml"),
        bullets([
            "**Readiness** failing removes the pod from the Service's endpoints: it gets no new requests but keeps running. Use it for \"still starting\", \"warming the menu cache\", \"cannot reach the database right now\". A rolling update only counts ready pods: with `maxUnavailable: 0` (as above) it removes an old pod only after a new one is ready, so a version that never becomes ready stops the roll instead of replacing everything. With the default `maxUnavailable: 25%`, up to a quarter of the old pods can go first.",
            "**Liveness** failing **restarts** the container. Use it only for \"this process is stuck and a restart would help\" - a deadlock, a hung event loop. Keep `/healthz` cheap and local.",
            "**Do not check dependencies in liveness.** If `/healthz` also pings Postgres, a slow database makes every pod fail liveness at once, Kubernetes restarts all of them, and a small slowdown becomes a full outage.",
            "**Slow starters** get a `startupProbe`, which holds off the liveness probe until the app has started once.",
        ]),
        p("Docker Compose has the same idea with `healthcheck:` and `depends_on: { db: { condition: service_healthy } }`, and load balancers have their own target health checks. Whatever the tool: ready means \"send me traffic\", alive means \"do not restart me\"."),

        h2("5. A rollback deploys the previous artifact"),
        p("A real rollback is **not** a rebuild of the old commit. Builds pull base images and packages again, and a rebuild a week later is a different image. A rollback runs the exact image that ran before - so you must be able to name it."),
        h3("Tags move, digests do not"),
        p("A **tag** (`:latest`, `:v2.14.0`, `:main`) is a label that the next `docker push` can move to other bytes. A **digest** (`@sha256:...`) is the hash of the image manifest: if one byte changes, the digest changes, so a digest always means the same image."),
        code("bash", `
docker buildx imagetools inspect ghcr.io/ricerocket/checkout:v2.13.4
# Name:      ghcr.io/ricerocket/checkout:v2.13.4
# MediaType: application/vnd.oci.image.index.v1+json
# Digest:    sha256:4c1e0f...                 (output shortened)`),
        bullets([
            "**Tag every build with something unique** - the version (`v2.14.0`) or the git commit (`3f9a1c2`) - and never deploy `latest`. `latest` is only the default tag name, not \"the newest\"; it means whatever was pushed last.",
            "**Make version tags immutable** where the registry supports it (Amazon ECR and several other registries can refuse to overwrite an existing tag), or **deploy by digest**: `image: ghcr.io/ricerocket/checkout@sha256:4c1e0f...`. CI can print the digest after `docker push` and write it into the deploy.",
            "**Record what ran.** The deploy tool should log each release's digest, so \"the version before this one\" is a lookup, not an investigation.",
            "**Keep old images.** A registry cleanup policy that deletes everything older than 7 days also deletes your rollback target.",
        ]),
        p("With unique tags, both of these are one-minute rollbacks:"),
        code("bash", `
kubectl rollout history deployment/checkout          # previous revisions and their templates
kubectl rollout undo deployment/checkout             # back to the previous revision
kubectl set image deployment/checkout checkout=ghcr.io/ricerocket/checkout:v2.13.4
kubectl rollout status deployment/checkout           # wait until every pod is ready`),
        callout("warning", "Rollback is a feature you have to test",
            "If nobody has rolled back in months, assume it does not work. Practise it on staging: deploy, roll back, and time it. The incident's 40 minutes were spent discovering, under pressure, that the old image had no name."),

        h2("6. Database changes: expand and contract"),
        p("The image is only half of a version. During a rolling or canary deploy, the old and the new code run **at the same time against the same database**, and after a rollback the old code must work on whatever schema the new code left behind. A migration that only the new version understands breaks both."),
        image("expand-contract", {
            alt: "Top, a red panel titled One release, the incident: v2.14.0 runs RENAME COLUMN customer_phone TO phone. v2.13 pods are still running and fail with column customer_phone does not exist, so checkout fails, and rolling back the code does not help because the old code needs a column that is gone. Below, Three small releases, green panels joined by arrows. 1, Expand, v2.14.0: ADD COLUMN phone, write both columns, backfill phone for old rows, still read customer_phone; v2.13 works, rollback to v2.13 is safe. 2, Migrate, v2.15.0: read phone only, keep writing both columns, no schema change; v2.14 works, rollback to v2.14 is safe. 3, Contract, v2.16.0: stop writing customer_phone, DROP COLUMN customer_phone, only once no running or rollback version reads it. Footer: each release is backward compatible with the one before it, so you can stop or roll back between any two steps; days can pass between steps, contract only when you are sure you will not go back.",
            caption: "Expand first, switch reads later, contract last. Each step is safe to roll back.",
        }),
        p("The pattern is called **expand and contract** (or parallel change):"),
        numbered([
            "**Expand**: add the new thing next to the old one - a new column, table or index - in a way the old code ignores. New code writes to both, and a backfill copies old rows.",
            "**Migrate**: once every running version writes both, switch reads to the new column. Nothing is removed yet.",
            "**Contract**: when no running version and no rollback target reads the old column any more, drop it.",
        ]),
        p("It takes three releases instead of one, and it is worth it: at every point, the previous release still works, so the rollback button stays real. The same rule applies to API fields, message formats and config keys - add, switch, then remove."),

        h2("7. Let numbers decide the canary"),
        p("The incident's canary had the right data; the decision was wrong. A canary gate compares the canary with the **baseline** - the old version, measured over the **same minutes** so that time-of-day traffic affects both - and stops the release on clear rules:"),
        numbered([
            "**Enough traffic to judge.** 40 requests with 0 errors proves nothing. Below a minimum number of canary requests the gate **holds**: it does not promote, and it waits or stops for a person.",
            "**Rates, not counts.** Divide errors by requests for each side. The canary always gets less traffic, so its counts always look smaller. Compare the difference in **percentage points**: 2.40% - 0.40% = 2.00 pp.",
            "**Latency against the baseline.** Compare tail latency (p95 - the next lesson explains it) with the baseline's, as an allowed increase such as \"at most 20% slower\".",
            "**Stop at the first bad step.** A later step that looks fine does not cancel an earlier failure. The gate rolls back and records why, with the numbers.",
        ]),
        p("Tools such as Argo Rollouts and Flagger run these steps for Kubernetes and query Prometheus for the numbers. The steps themselves are plain configuration:"),
        code("yaml", `
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: checkout
spec:
  strategy:
    canary:
      steps:
        - setWeight: 5
        - pause: { duration: 10m }
        - setWeight: 25
        - pause: { duration: 10m }
        - setWeight: 50
        - pause: { duration: 10m }`, "rollout.yaml"),
        p("The analysis between steps is where your rules live. In the challenge below you write that analysis yourself, in Python, so that you know exactly what such a tool decides and why."),
        callout("info", "Feature flags: release without a deploy",
            "A feature flag turns a code path on or off at runtime, for everyone or for a share of users. It separates releasing a feature from deploying code, and it gives you a kill switch that is faster than any rollback. Flags need cleaning up after the rollout, or the code fills with dead branches."),

        h2("8. Your turn"),
        p("First, two decisions from the incident: which image references give you a real rollback target, and which migration plan keeps the old version alive."),
        challenge("chal_quiz_devf_331", "For the first question, ask of each reference: could a later push make this name point to other bytes? For the second, ask of each plan: while old and new pods share the database, and after a rollback, does every running version still find the columns it reads?"),
        p("Now the gate itself. `analyze_canary(config, steps)` gets the thresholds and the measurements of every canary step, and returns PROMOTE, HOLD or ROLLBACK with a reason that quotes the numbers - the decision the incident needed."),
        challenge("chal_coding_devf_332", "Write a helper that checks one step and returns None or a (decision, reason) pair: first the canary's request count, then the error rates as percentages and their difference, then the p95 with whole-number math (canary_p95 * 100 > baseline_p95 * (100 + pct)). In analyze_canary, loop over the steps, append each result to checked, and return as soon as a step fails."),

        h2("9. Pitfalls"),
        bullets([
            "**Deploying `:latest`** (or any tag that moves): you cannot name the previous version, and `kubectl rollout undo` brings back the same image.",
            "**Rebuilding an old commit to roll back**: a new build is a new image. Redeploy the old artifact.",
            "**Comparing error counts** between canary and baseline: the canary always has fewer requests. Compare rates.",
            "**Promoting a canary on a tiny sample**: a few hundred requests with no errors is luck, not evidence. Set a minimum.",
            "**Comparing with yesterday instead of a baseline**: traffic, cache warmth and time of day differ. Measure the old version over the same minutes.",
            "**A destructive migration in the same release as the code that needs it**: old pods break during the roll and a rollback cannot help. Expand, migrate, contract.",
            "**Dependency checks in the liveness probe**: a slow database restarts every pod at once.",
            "**Deleting the blue environment right after the switch**: keep it until you are sure you will not switch back.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every image has a unique, never-reused tag or is deployed by digest; nothing in production says `latest`.",
            "The deploy tool records which digest ran, and old images survive the registry's cleanup policy.",
            "You picked a strategy on purpose: recreate, rolling, blue-green or canary, and you know what each costs.",
            "Readiness answers \"send me traffic?\", liveness answers \"restart me?\", and liveness does not check dependencies.",
            "Schema changes follow expand and contract; every release still works with the previous release's code.",
            "Canary promotion is decided by a gate: minimum traffic, error-rate difference and latency against a baseline from the same minutes.",
            "You have rolled back on staging recently and know how long it takes.",
        ]),
    ],
});
