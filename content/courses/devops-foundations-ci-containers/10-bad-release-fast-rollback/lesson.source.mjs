// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-devf-3-4",
    title: "Bad Release, Fast Rollback: a health check that said OK",
    slug: { _type: "slug", current: "devops-bad-release-fast-rollback-health-check" },
    description:
        "Rice Rocket's checkout v3.2.0 passed its health check on every pod while almost a third of its requests failed: /health returned 200 without touching the database, and the new code read a variable the Deployment did not set. The canary was promoted on that 200, and orders failed for about fifteen minutes. Work through the incident the way on-call engineers do: collect the evidence, form a hypothesis, roll back first, then fix the health check, prove the fix by watching it fail, and write it all down.",
    estimatedTime: 25,

    scenario: {
        role: "Junior DevOps engineer on the on-call rotation at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "At 14:00 on a Tuesday, checkout v3.2.0 went to a 10% canary. Both canary pods answered GET /health with 200, so after five minutes the deploy tool promoted the release to 100%. At 14:07 the alert fired: 31% of checkout requests returned 500. You are on call. You need to stop the damage, find out why a release that said OK was broken, and make sure the next broken release cannot pass the same check.",
    },

    content: [
        h2("1. The incident"),
        p("After lesson 7, Rice Rocket's checkout moved to canary releases. The canary step for v3.2.0 was configured like this: send 10% of traffic to the new pods, wait five minutes, and promote if the pods stay healthy. \"Healthy\" meant one thing: `GET /health` returns 200."),
        p("v3.2.0 was a cleanup release. Among 1,400 changed lines, it renamed the setting that holds the database connection string from `DB_URL` to `DATABASE_URL`. Nobody changed the Deployment, which still set `DB_URL` from the database secret. This is what happened next:"),
        bullets([
            "**The pods started fine.** The connection pool was created with `open=False`, so it did not connect at start-up. The empty connection string was only used later, on the first query.",
            "**`/health` answered 200 on every pod.** The handler returned `{\"status\": \"ok\"}` without looking at anything.",
            "**Every request that needed the database failed.** Placing an order, paying, checking order status: all 500. The menu pages come from a cache, so they still worked - which is why the error rate was about 30% and not 100%.",
            "**The gate promoted the release at 14:05,** because the only thing it checked was the 200. At 14:07 all 20 pods ran v3.2.0 and the alert fired.",
        ]),
        p("Nothing here is exotic. A renamed variable, a lazy connection pool and a health check that checks nothing: each is harmless alone, together they shipped a broken release with a green light."),

        h2("2. First, collect the evidence"),
        p("The first minutes of an incident are for **looking**, not fixing. You want a few facts that you can point at, saved somewhere the rollback will not erase them. For a bad deploy, four sources answer most questions:"),
        numbered([
            "**The deploy log**: what changed, when, and why the tool thought it was safe.",
            "**What the health check sees**: call the endpoint yourself, then read the pod's own log for the same minute.",
            "**The error-rate graph**: when the errors started, and whether they follow the new version.",
            "**The code that answered**: the health handler and whatever the error message points to.",
        ]),
        code("text", `
14:00:03 deploy checkout v3.2.0 (sha256:7d41e0...) as canary, weight 10%
14:00:41 canary pods ready 2/2 (readinessProbe GET /health -> 200)
14:05:03 gate: GET /health returned 200 on 2/2 canary pods for 300s -> PROMOTE
14:05:04 setWeight 100
14:06:52 rollout complete: 20/20 pods on v3.2.0, ready 20/20`, "deploy log"),
        code("bash", `
curl -s -w ' %{http_code} %{time_total}s\\n' http://10.4.7.21:8080/health
# {"status": "ok", "version": "3.2.0"} 200 0.002s

kubectl logs checkout-6f9c7b-x2kqp --since=5m | grep ERROR | tail -3
# ERROR POST /orders 500 psycopg.OperationalError: connection to server on socket
#   "/var/run/postgresql/.s.PGSQL.5432" failed: No such file or directory`),
        code("text", `
time    v3.1.4 (baseline)   v3.2.0 (canary)      5xx rate, 1-minute buckets
13:58   0.3%                -
14:01   0.3%                29.6%
14:03   0.4%                30.9%
14:05   ---- promoted to 100% ----
14:07   -                   31.2%
14:09   -                   31.0%`, "error rate"),
        code("python", `
VERSION = "3.2.0"
DATABASE_URL = os.environ.get("DATABASE_URL", "")   # v3.1.4 read os.environ["DB_URL"]
pool = ConnectionPool(DATABASE_URL, open=False)      # connects on the first query

@app.get("/health")
def health():
    return {"status": "ok", "version": VERSION}`, "checkout/app.py (v3.2.0)"),
        p("Save copies: paste the log lines and the graph into the incident channel, with times. After a rollback the broken pods are gone, and so are their logs unless your log platform keeps them."),

        h2("3. From evidence to a hypothesis"),
        p("A **hypothesis** is one sentence that explains all the evidence and that you can check with one more command. Read the four pieces together:"),
        bullets([
            "The errors start with the canary and follow the new version, so the cause is in v3.2.0 or in how it is deployed, not in the database itself (the old pods were fine at the same minutes).",
            "The error says libpq tried a **local socket**, `/var/run/postgresql/...`. That is what libpq does when the connection string is empty: it falls back to the default.",
            "The code reads `DATABASE_URL` with a default of `\"\"`.",
        ]),
        p("Hypothesis: **v3.2.0 reads `DATABASE_URL`, the Deployment only sets `DB_URL`, so the app connects with an empty string.** One command checks it:"),
        code("bash", `
kubectl exec checkout-6f9c7b-x2kqp -- printenv | grep -E '^(DB_URL|DATABASE_URL)='
# DB_URL=postgres://checkout:...@db.internal:5432/checkout`),
        p("Only `DB_URL` is there. The hypothesis holds. Notice what you did **not** do: read the 1,400-line diff. Evidence pointed at one line; the diff would have taken an hour."),
        callout("info", "A hypothesis can be wrong",
            "If printenv had shown DATABASE_URL with a good value, you would drop this hypothesis and form the next one from the evidence: maybe a firewall rule, maybe a wrong password in the secret. Write each one down with the command that confirmed or rejected it; the incident report needs them."),

        h2("4. Roll back first, fix later"),
        p("At 14:12, 31% of orders fail. You now know roughly why, and the fix looks like a one-line change to the Deployment. It is still the wrong moment to fix forward:"),
        bullets([
            "**A rollback is a known, tested step.** The previous version ran an hour ago; its digest is in the deploy log. Running it again takes a minute.",
            "**A fix is new code under pressure.** It needs a build, a review and a deploy, and if the hypothesis is only half right, the second release fails too.",
            "**The evidence is not lost.** You saved logs and graphs, and the broken image `sha256:7d41e0...` is still in the registry. You can run it on staging and debug it there, with no users waiting.",
        ]),
        code("bash", `
# The digest from the deploy log of the last good release:
kubectl set image deployment/checkout \\
  checkout=ghcr.io/ricerocket/checkout@sha256:2b9a55...
kubectl rollout status deployment/checkout     # wait until every pod is ready
# With Argo Rollouts: kubectl argo rollouts abort checkout / undo checkout
# (check the current docs of your deploy tool for the exact commands)`),
        p("Then **verify the rollback**, do not assume it: the 5xx rate on the dashboard should return to the baseline (0.3% here) within a few minutes, and `kubectl get pods -o wide` should show only the old image."),
        h3("When a rollback is not the answer"),
        bullets([
            "**The release ran a destructive migration** (lesson 7): the old code cannot run on the new schema, so rolling back breaks it again. Expand-and-contract migrations exist so that this case does not happen.",
            "**The release is not the cause.** If the old version fails in the same way at the same minutes, rolling back changes nothing. Check the baseline first.",
            "**A feature flag can turn the change off** faster than a deploy. Use it, if one exists.",
        ]),

        h2("5. Why the health check said OK"),
        p("The real bug of this incident is not the renamed variable. Mistakes like that will happen again. The bug is that the release had **a check that could not fail**. A health check is only as good as what it checks."),
        p("Lesson 7 split the question in two. Apply it here:"),
        bullets([
            "**Liveness** (`/healthz`): \"is this process stuck?\" Keep it cheap and local. It must not check the database, or a slow database restarts every pod at once.",
            "**Readiness** (`/ready`): \"can this pod do its job right now?\" This is where the database belongs. A pod whose database is unreachable should get no traffic.",
            "**Start-up config check**: \"is the configuration complete?\" A missing required variable should stop the process at start-up with a clear message, so the pod never becomes ready at all.",
        ]),
        p("v3.2.0 had one endpoint, used it for readiness, and it checked nothing. Any of the three checks above would have stopped the canary at 0 ready pods."),
        h3("What a readiness check should and should not check"),
        bullets([
            "**Check the dependencies the pod cannot work without**: the main database, a required config value. Use a short timeout, so a slow dependency counts as not ready instead of hanging the probe.",
            "**Do not check optional dependencies.** If recommendations are down, checkout should still take orders. Making every pod unready because of an optional service turns a small problem into a full outage.",
            "**Keep it cheap.** The probe runs every few seconds on every pod. `SELECT 1` is fine; a report query is not.",
            "**Report why.** `{\"ready\": false, \"problems\": [\"config DATABASE_URL is not set\"]}` in the 503 body saves the next on-call engineer ten minutes.",
        ]),

        h2("6. The fix, in code"),
        p("Here is the readiness check v3.2.1 shipped, simplified. The config check also runs once at start-up and stops the app, so a pod with missing config never starts:"),
        code("python", `
import os
import sys
import time

REQUIRED = ["DATABASE_URL", "PAYMENT_API_URL"]
TIMEOUT_MS = 500


def missing_config():
    """Names of required variables that are missing or empty."""
    return [name for name in REQUIRED if not os.environ.get(name, "").strip()]


def database_problem():
    """None when SELECT 1 answers in time, otherwise a short reason."""
    start = time.monotonic()
    try:
        with pool.connection(timeout=TIMEOUT_MS / 1000) as conn:
            conn.execute("SELECT 1")
    except Exception as error:
        return f"database: {type(error).__name__}"
    elapsed_ms = round((time.monotonic() - start) * 1000)
    if elapsed_ms > TIMEOUT_MS:
        return f"database: slow ({elapsed_ms} ms > {TIMEOUT_MS} ms)"
    return None


@app.get("/ready")
def ready():
    problems = [f"config {name} is not set" for name in missing_config()]
    db = database_problem()
    if db:
        problems.append(db)
    status = 200 if not problems else 503
    return {"ready": not problems, "problems": problems}, status


@app.get("/healthz")
def healthz():
    return {"alive": True}          # liveness stays cheap and local


if missing_config():                # at start-up: refuse to run without config
    sys.exit(f"missing config: {', '.join(missing_config())}")`, "checkout/health.py"),
        p("And the Deployment points each probe at the right endpoint:"),
        code("yaml", `
readinessProbe:
  httpGet: { path: /ready, port: 8080 }
  periodSeconds: 5
  timeoutSeconds: 2
  failureThreshold: 3
livenessProbe:
  httpGet: { path: /healthz, port: 8080 }
  periodSeconds: 10`, "deployment.yaml"),
        p("Two more changes close the gap. The Deployment now sets `DATABASE_URL`. And the canary gate no longer promotes on health alone: it compares the canary's error rate with the baseline over the same minutes, as in lesson 7. Two independent checks: if one is wrong, the other still catches the release."),

        h2("7. Verify the fix by watching it fail"),
        p("A check that you have only seen passing proves nothing; v3.2.0's `/health` passed too. To verify a new check, **reproduce the original failure on purpose** and watch the check catch it. On staging, deploy v3.2.1 with the old Deployment that only sets `DB_URL`:"),
        code("bash", `
kubectl -n staging apply -f deployment-old-env.yaml       # still sets only DB_URL
kubectl -n staging get pods -l app=checkout
# NAME                          READY   STATUS             RESTARTS
# checkout-5d1c9-q8r2t          0/1     CrashLoopBackOff   3
kubectl -n staging logs checkout-5d1c9-q8r2t
# missing config: DATABASE_URL`),
        p("The start-up check stops the pod, and it never receives traffic. Now remove the start-up check for a moment (or set `DATABASE_URL` to a wrong host) and confirm that `/ready` alone returns 503 with a reason. Each layer of defence should be seen failing once. Then apply the correct Deployment and watch the pods become ready and the canary gate pass."),
        p("Write down what you saw, with the commands. \"We verified the fix\" means nothing to a reader; \"with DB_URL only, pods stay 0/1 with 'missing config: DATABASE_URL'\" can be checked by anyone."),

        h2("8. Your turn"),
        p("First, walk through the evidence pack of this incident one piece at a time and decide what each piece really shows."),
        challenge("chal_quiz_devf_341"),
        p("Now the readiness check itself. The team's first version of `readiness(snapshot)` still lets three kinds of broken pods through on staging. Find out why from the symptoms, and fix it."),
        challenge("chal_fix_devf_342"),

        h2("9. Common mistakes"),
        bullets([
            "**A health check that cannot fail.** `return {\"status\": \"ok\"}` tells you the web server runs. Spot it: read the handler. If it touches nothing, it checks nothing.",
            "**Debugging in production before rolling back.** Spot it: the incident channel discusses a diff while the error rate is still high. Roll back first; debug the saved evidence and the old image on staging.",
            "**Rolling back without checking the result.** Spot it: nobody looked at the error rate after the rollback. The incident is over when the graph says so, not when the command finishes.",
            "**Checking optional services in readiness.** Spot it: one non-critical dependency goes down and every pod becomes unready at once. Only check what the pod cannot work without.",
            "**Silent defaults for required config.** `os.environ.get(\"DATABASE_URL\", \"\")` turns a missing value into a confusing error far away. Spot it: grep for `.get(` on required settings, and fail at start-up instead.",
        ]),

        h2("10. Summary"),
        bullets([
            "**Evidence, hypothesis, rollback.** Save the deploy log, the health output, the error graph and the code; form one hypothesis you can check with one command; then roll back to a known digest and verify on the graph that it worked.",
            "**Fix the check, not only the bug.** Readiness checks what the pod needs (config, database, with a timeout), liveness stays cheap, required config stops the app at start-up, and the canary gate compares error rates too.",
            "**Verify by failing.** Reproduce the original mistake on staging and watch the new check stop it before any user sees it.",
        ]),
        callout("success", "Self-practice (not graded): write the incident report",
            "Write a one-page report for this incident in your own words. Use these headings: Summary (two sentences: what users saw, for how long), Timeline (14:00 to 14:16, from the deploy log and the graph), Impact (share of failed requests, which features), Root cause (the renamed variable) and Contributing causes (the health check that could not fail, the lazy pool, the gate that only looked at /health), What went well (fast rollback by digest, saved evidence), and Actions (each with an owner and a date). Keep it blameless: describe what the system allowed, not who made the mistake. Compare your actions with sections 5 to 7."),
    ],
});
