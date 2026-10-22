"""
Plan a run of Rice Rocket's CI workflow: when does every job start and end, and what decides the total time?

`jobs` is the list of jobs of one workflow run, in the order they appear in the YAML file:
    {"name": "build", "needs": ["lint", "unit"], "minutes": 3, "result": "success"}
"minutes" is how long the job runs, "result" is how it ends when it runs ("success" or "failure").
There are enough runners for every job, so jobs that do not wait on each other run in parallel.

Requirements:
  - Check the graph first, and return {"error": ...} instead of a plan when it is broken:
      * a need that is not the name of a job -> "job 'deploy' needs unknown job 'tests'"
        (the first one found, jobs in input order, needs in list order);
      * jobs that can never start because they are in a cycle or wait on one ->
        "cycle: build, deploy, test" (those job names, sorted, joined by ", ").
  - A job runs when every job in its "needs" has finished with "success".
    It starts at the latest "end" of its needs (0 when it has no needs) and ends at start + minutes.
    Its status is its "result".
  - A job with a need that failed or was skipped does not run (the default `if: success()`):
    status "skipped", start and end are None. Skipping spreads: the jobs that need a skipped job
    are skipped too.
  - "jobs" lists {"name", "status", "start", "end"} for every job, in input order.
  - "wall_minutes" is the latest end of all jobs that ran.
  - "critical_path" is the chain of jobs that decided "wall_minutes", first job first:
    start from the job with the latest end (on a tie, the first one in input order), then go to
    its need with the latest end (on a tie, the first one in its needs list), and so on until a
    job without needs.

Example: lint (2 min), unit (5 min), build needs [lint, unit] (3 min), deploy needs [build] (2 min)
  -> lint 0-2, unit 0-5, build 5-8, deploy 8-10, "wall_minutes": 10,
     "critical_path": ["unit", "build", "deploy"]
"""
import json
import sys


def plan_run(jobs: list) -> dict:
    # Naive version: runs the jobs one after the other in file order, like one long shell script.
    clock = 0
    plan = []
    for job in jobs:
        plan.append({"name": job["name"], "status": job["result"], "start": clock, "end": clock + job["minutes"]})
        clock += job["minutes"]
    return {"jobs": plan, "wall_minutes": clock, "critical_path": [job["name"] for job in jobs]}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON: {"jobs": [...]}) from stdin and prints the plan as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(plan_run(case["jobs"]), ensure_ascii=False))
