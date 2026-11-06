// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pdp-3-3",
    title: "Orchestration: DAGs, retries and SLAs",
    slug: { _type: "slug", current: "data-pipelines-orchestration-dags" },
    description:
        "Rice Rocket's nightly pipeline was a cron line calling one script: when step three failed at 02:14, nothing retried, nothing waited, and nobody knew until 08:00. Learn to run it as a DAG in Airflow: tasks and dependencies, retries that are safe because tasks are idempotent, catchup, trigger rules and a deadline that pages someone before finance notices.",
    estimatedTime: 15,

    scenario: {
        role: "Data engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The nightly pipeline (extract, stage, audit, publish, commission) ran from one cron line on a VM. A dropped database connection at 02:14 killed the whole script; the restaurant export was sometimes late and the script loaded an empty file; and the only alert was a manager asking why the dashboard was empty.",
    },

    content: [
        h2("Situation"),
        code("text", `
# crontab on etl-01
0 2 * * *  cd /srv/pipelines && python nightly.py >> /var/log/nightly.log 2>&1

# /var/log/nightly.log, 2026-11-06
02:00:01 extract: 0 rows from exports/orders-2026-11-05.csv (file not there yet)
02:00:02 stage: 0 rows
02:00:02 audit: volume WARN
02:00:03 publish: 0 rows published
02:14:10 commission: psycopg.OperationalError: connection reset by peer
         Traceback (most recent call last): ...`, "etl-01"),
        bullets([
            "The export arrives between 01:30 and 02:40; the script did not wait for it.",
            "One transient error ended the night: no retry, no partial rerun of only the failed step.",
            "Nothing measured \"the dashboard must be ready by 07:00\", so the failure surfaced at 08:00 as a complaint.",
        ]),

        h2("The core you need"),
        bullets([
            "**A DAG is the dependency graph of tasks.** Each task (extract, stage, audit, publish, commission, notify) runs when its upstream tasks succeed; the orchestrator (Airflow, Dagster, Prefect) records every run and attempt, so one failed task can be retried or cleared without rerunning the night.",
            "**Retries are safe only for idempotent tasks.** A retry runs the task from the top. Tasks that delete-and-rewrite their partition, or write to staging and swap, can be retried freely; tasks that append duplicate data on every attempt. Retry transient errors with a delay (`retries`, `retry_delay`, exponential backoff); fix logic errors instead of retrying them.",
            "**Wait for data, not for a clock time.** Schedule on the data's arrival: a sensor (`FileSensor` / an S3 key sensor with `mode=\"reschedule\"` and a timeout), or data-aware scheduling, where the DAG runs when the upstream asset is updated (Airflow assets, previously called datasets; Dagster assets).",
            "**Trigger rules decide who runs after a failure.** The default `all_success` stops `publish` when `audit` fails, which is the point of the audit. `all_done` suits notification and cleanup tasks that must run whatever happened.",
            "**Catchup and logical dates.** Each run has a data interval; tasks use it instead of `now()`. With `catchup=True` the scheduler runs every interval since `start_date` that never ran: useful for an intended backfill, dangerous when a DAG with an old `start_date` is switched on. `max_active_runs=1` keeps nightly runs from overlapping.",
            "**A deadline is a promise to someone.** \"Published by 07:00\" needs an alert at 06:30 when the run is not done, routed to the on-call engineer. Airflow 2 had SLA misses; Airflow 3 replaces them with deadline alerts (check your version), and many teams also alert from the data side: the newest partition's age.",
        ]),

        h2("Apply it in the project"),
        code("python", `
import pendulum
from datetime import timedelta
from airflow.sdk import dag, task                  # Airflow 3 (Airflow 2: airflow.decorators)
from airflow.providers.standard.sensors.filesystem import FileSensor

DEFAULTS = {"retries": 3, "retry_delay": timedelta(minutes=5), "retry_exponential_backoff": True}


@dag(schedule="0 1 * * *", start_date=pendulum.datetime(2026, 11, 1, tz="Asia/Ho_Chi_Minh"),
     catchup=False, max_active_runs=1, default_args=DEFAULTS, tags=["orders"])
def nightly_orders():
    export_ready = FileSensor(task_id="export_ready", filepath="exports/orders-{{ ds }}.csv",
                              mode="reschedule", poke_interval=300, timeout=3 * 3600)

    @task
    def stage(ds=None): return stage_export(ds)             # delete + insert staging for ds

    @task
    def audit(ds=None): return run_checks(ds)               # raises on error checks

    @task
    def publish(ds=None): publish_partition(ds)             # swap the day into orders

    @task
    def commission(ds=None): nightly(warehouse(), ds, lookback=3)

    @task(trigger_rule="all_done")
    def notify(ds=None): post_summary(ds)                   # every outcome goes to #data-alerts

    s = stage()
    export_ready >> s >> audit() >> publish() >> commission() >> notify()


nightly_orders()`, "dags/nightly_orders.py"),
        callout("info", "Airflow 2 and 3",
            "Airflow 3 moved the DAG authoring API to `airflow.sdk`, renamed datasets to assets and reworked SLAs into deadline alerts; the concepts above are the same in both. Pin the version in your requirements and check the operator import paths against its documentation."),

        h2("Verify"),
        code("bash", `
airflow dags test nightly_orders 2026-11-05          # one full run locally, task by task
airflow dags list-runs nightly_orders --limit 3
# run_id                          state    start                 end
# scheduled__2026-11-05T18:00...  success  2026-11-06 01:00:02   2026-11-06 02:41:37
airflow tasks states-for-dag-run nightly_orders scheduled__2026-11-05T18:00:00+00:00
# export_ready  success   (waited 98 min, rescheduled 20 times)
# commission    success   (try 2 of 4: connection reset on try 1)`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Retrying a task that appends.** Every retry adds another copy of what the failed attempt already wrote. Before adding `retries`, rerun the task twice by hand and compare row counts.",
            "**Switching on a DAG with an old start_date and catchup.** Hundreds of runs queue against production at once. Check `airflow dags list-runs --state queued` right after enabling a DAG, and keep `catchup=False` unless a backfill is the goal.",
            "**Sensors that hold a worker.** A sensor in `poke` mode keeps a worker slot for hours while it waits. Use `mode=\"reschedule\"` (or deferrable sensors) and a timeout, so a missing export fails the run in time for someone to act.",
        ]),

        challenge("chal_quiz_pdp_191"),
    ],
});
