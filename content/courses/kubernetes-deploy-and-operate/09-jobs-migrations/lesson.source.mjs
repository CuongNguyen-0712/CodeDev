// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-k8s-3-3",
    title: "Jobs, CronJobs and database migrations",
    slug: { _type: "slug", current: "kubernetes-jobs-cronjobs-migrations" },
    description:
        "Rice Rocket's migrations ran in the api's start command, so six replicas raced on one migration; the first migration Job then retried a broken migration for almost half an hour, and the nightly cleanup ran at lunchtime because its schedule was read in UTC. Learn how Jobs retry and give up, how CronJobs schedule, overlap and catch up, and write both for release 1.5.0.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The api runs as a Deployment with six replicas in the namespace `rice-rocket`; Postgres is managed outside the cluster. Two kinds of work do not fit a Deployment: the schema migration of each release, which must run once and finish before the new pods start, and a cleanup of abandoned carts that should run every night while almost nobody orders.",
    },

    content: [
        h2("Situation"),
        p("Until release 1.4 the api image started with `node dist/migrate.js && node dist/server.js`. A rollout of six replicas therefore started six migrations at once:"),
        code("text", `
api-6f9c-2xk4p  migrate: applying 0042_add_courier_rating
api-6f9c-8hq1z  migrate: applying 0042_add_courier_rating
api-6f9c-k7d3m  error: deadlock detected (SQLSTATE 40P01)
api-6f9c-k7d3m  Back-off restarting failed container`, "kubectl logs"),
        p("The first fix was a Job with `restartPolicy: OnFailure` and no other settings. When migration 0043 had a bug, the Job restarted the same container again and again with the default `backoffLimit` of 6; CI waited for almost half an hour before anyone looked, and the logs of the first failure were gone. The cart cleanup CronJob had its own surprise:"),
        code("yaml", `
apiVersion: batch/v1
kind: CronJob
metadata:
  name: expire-carts
spec:
  schedule: "0 3 * * *"          # meant as 03:00 in Ho Chi Minh City
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: expire-carts
              image: ghcr.io/rice-rocket/api:1.4.0
              command: ["node", "dist/jobs/expire-carts.js"]`, "k8s/jobs.yaml (1.4)"),
        bullets([
            "It ran at 10:00 local time, in the middle of lunch orders, and locked the `carts` table for minutes.",
            "One night it hung on a lock and was still running when the next night's run started next to it.",
        ]),

        h2("The core you need"),
        bullets([
            "**A Job runs pods until one succeeds.** With `restartPolicy: Never` every failed attempt leaves its pod (and its logs) and the Job creates a new one; with `OnFailure` the same pod restarts its container and the earlier logs are lost. A Job never uses `Always`.",
            "**When a Job gives up.** Failed attempts are retried after an exponential back-off (10 s, 20 s, 40 s ... capped at six minutes) until more than `backoffLimit` have failed (default 6): the Job gets the condition `Failed` with reason `BackoffLimitExceeded`. `activeDeadlineSeconds` caps the whole Job from its start, whatever the retries: reason `DeadlineExceeded`, running pods are stopped.",
            "**Clean up and name per release.** `ttlSecondsAfterFinished` deletes the finished Job and its pods after that many seconds. A Job's pod template cannot be changed after creation, so each release gets its own Job (`migrate-1-5-0`) instead of editing the old one.",
            "**One migration, then the rollout.** CI applies the Job, waits for `condition=complete`, and only then sets the new image on the Deployment. The migration runs once whatever the replica count, and a failed migration stops the release before any new pod starts.",
            "**A CronJob creates Jobs on a schedule.** `schedule` is standard cron (minute, hour, day of month, month, day of week). Without `timeZone` it is read in the controller manager's time zone, which is UTC on most managed clusters; `timeZone: Asia/Ho_Chi_Minh` (stable since Kubernetes 1.27) makes `0 3 * * *` mean 03:00 local.",
            "**Overlap and late runs.** `concurrencyPolicy: Forbid` skips a run while the previous one is still active (`Allow`, the default, starts both; `Replace` stops the old one). When the controller missed a run, for example during a cluster upgrade, it starts the run as soon as it is back, unless it is later than `startingDeadlineSeconds`. `activeDeadlineSeconds` in `jobTemplate.spec` stops a single run that hangs.",
        ]),

        h2("Apply it in the project"),
        p("Release 1.5.0 ships `k8s/jobs.yaml` with a migration Job for this release and the corrected CronJob:"),
        code("yaml", `
apiVersion: batch/v1
kind: Job
metadata:
  name: migrate-1-5-0
  namespace: rice-rocket
spec:
  backoffLimit: 1                  # one retry: a lock timeout gets a second chance
  activeDeadlineSeconds: 300       # never longer than CI waits
  ttlSecondsAfterFinished: 86400   # keep the pods (and logs) for a day
  template:
    metadata:
      labels:
        app: migrate
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: ghcr.io/rice-rocket/api:1.5.0
          command: ["node", "dist/migrate.js"]
          envFrom:
            - secretRef:
                name: api-secrets
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: expire-carts
  namespace: rice-rocket
spec:
  schedule: "0 3 * * *"
  timeZone: Asia/Ho_Chi_Minh
  concurrencyPolicy: Forbid
  startingDeadlineSeconds: 600     # more than 10 minutes late: wait for tomorrow
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 2
      activeDeadlineSeconds: 3600
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: expire-carts
              image: ghcr.io/rice-rocket/api:1.5.0
              command: ["node", "dist/jobs/expire-carts.js"]
              envFrom:
                - secretRef:
                    name: api-secrets`, "k8s/jobs.yaml"),
        p("The deploy job of the CI course runs the release in this order:"),
        code("bash", `
kubectl apply -f k8s/jobs.yaml
kubectl -n rice-rocket wait --for=condition=complete job/migrate-1-5-0 --timeout=300s \\
  || { kubectl -n rice-rocket logs job/migrate-1-5-0 --all-containers; exit 1; }
kubectl -n rice-rocket set image deployment/api api=ghcr.io/rice-rocket/api:1.5.0
kubectl -n rice-rocket rollout status deployment/api --timeout=180s`, "deploy step"),
        callout("info", "Migrations that the old version survives",
            "The migration runs while the 1.4 pods still serve traffic, and a rollback puts 1.4 back on the new schema. Write migrations in two steps (add the column now, drop the old one in a later release) so both versions work with the schema in between."),

        h2("Verify"),
        code("bash", `
kubectl -n rice-rocket get job migrate-1-5-0
# NAME            STATUS     COMPLETIONS   DURATION   AGE
# migrate-1-5-0   Complete   1/1           38s        2m
kubectl -n rice-rocket get pods -l app=migrate
# NAME                  READY   STATUS      RESTARTS   AGE
# migrate-1-5-0-7tq2c   0/1     Completed   0          2m
kubectl -n rice-rocket get cronjob expire-carts
# NAME           SCHEDULE    TIMEZONE           SUSPEND   ACTIVE   LAST SCHEDULE   AGE
# expire-carts   0 3 * * *   Asia/Ho_Chi_Minh   False     0        <none>          2m
kubectl -n rice-rocket create job expire-carts-manual --from=cronjob/expire-carts   # one run now, to test it
kubectl -n rice-rocket logs job/expire-carts-manual   # expired 214 carts older than 24h`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**`kubectl wait` does not notice a failure.** `--for=condition=complete` keeps waiting when the Job fails, until `--timeout`. Keep the timeout close to `activeDeadlineSeconds`, and print the Job's logs when the wait fails, as above.",
            "**Editing a Job instead of creating a new one.** `kubectl apply` on an existing Job with a new image fails with `field is immutable`. Name the Job after the release, and let `ttlSecondsAfterFinished` remove the old ones.",
            "**A schedule converted by hand to UTC.** `0 20 * * *` without `timeZone` also means 03:00 in Ho Chi Minh City, until someone reads it as 20:00, or the cluster moves to a controller in another zone. Write the local time with `timeZone`.",
        ]),

        p("Now write release 1.5.0's jobs file. The editor holds `k8s/jobs.yaml` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the 1.4 mistakes on purpose. Run plays the Job controller through failing, slow and hanging migrations, and the CronJob controller through two or three nights, a hung run and a controller outage."),
        challenge("chal_coding_k8s_192"),
    ],
});
