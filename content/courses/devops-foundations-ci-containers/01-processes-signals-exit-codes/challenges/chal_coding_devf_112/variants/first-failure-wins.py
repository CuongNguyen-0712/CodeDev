"""
Explain a CI job's exit codes for the Rice Rocket deploy pipeline.

A job is a list of steps. Each step is one shell pipeline, given as the exit codes of its
commands from left to right: `./migrate.sh | tee migrate.log` that failed is [1, 0].
The job runs with `set -e`, and `pipefail` is on or off for the whole job.

Requirements:
  - pipeline_status(codes, pipefail): the exit status of one pipeline.
      * pipefail off -> the exit code of the LAST command (bash's default).
      * pipefail on  -> the exit code of the RIGHTMOST command that failed (non-zero),
                        or 0 if every command succeeded.
  - meaning(code): what an exit code (0-255) means, as text:
      * 0          -> "ok"
      * 126        -> "found but not executable"
      * 127        -> "command not found"
      * 129 - 192  -> killed by signal N = code - 128:
                      "killed by SIGTERM" for a signal in SIGNALS below,
                      "killed by signal 10" for any other signal number
      * anything else (1-125, 128, 193-255) -> "error (exit 3)"
  - run_job(steps, pipefail): run the steps in order, like `set -e`:
      * every step that runs gets {"name", "status", "meaning", "commands"}:
        status = pipeline_status(...), meaning = meaning(status) and
        commands = [meaning(c) for c in the pipeline] (what ${PIPESTATUS[@]} would show);
      * the first step whose status is not 0 stops the job; every later step is
        {"name": ..., "status": None, "meaning": "skipped", "commands": None};
      * the result is {"steps": [...], "job": "ok", "exit_code": 0} when no step failed, or
        {"steps": [...], "job": "failed at migrate (exit 1)", "exit_code": 1}.

Example: run_job([{"name": "migrate", "pipeline": [1, 0]}, {"name": "smoke", "pipeline": [0]}], pipefail=True)
  -> {"steps": [{"name": "migrate", "status": 1, "meaning": "error (exit 1)", "commands": ["error (exit 1)", "ok"]},
                {"name": "smoke", "status": None, "meaning": "skipped", "commands": None}],
      "job": "failed at migrate (exit 1)", "exit_code": 1}
"""
import json
import sys

SIGNALS = {1: "SIGHUP", 2: "SIGINT", 3: "SIGQUIT", 6: "SIGABRT", 9: "SIGKILL", 11: "SIGSEGV", 13: "SIGPIPE", 15: "SIGTERM"}


def pipeline_status(codes, pipefail):
    if not pipefail:
        return codes[-1]
    failed = [code for code in codes if code != 0]
    return failed[0] if failed else 0


def meaning(code):
    if code == 0:
        return "ok"
    if code == 126:
        return "found but not executable"
    if code == 127:
        return "command not found"
    if 129 <= code <= 192:
        signal = code - 128
        return f"killed by {SIGNALS[signal]}" if signal in SIGNALS else f"killed by signal {signal}"
    return f"error (exit {code})"


def run_job(steps, pipefail):
    report = []
    failure = None
    for step in steps:
        if failure is not None:
            report.append({"name": step["name"], "status": None, "meaning": "skipped", "commands": None})
            continue
        status = pipeline_status(step["pipeline"], pipefail)
        report.append({
            "name": step["name"],
            "status": status,
            "meaning": meaning(status),
            "commands": [meaning(code) for code in step["pipeline"]],
        })
        if status != 0:
            failure = (step["name"], status)
    if failure is None:
        return {"steps": report, "job": "ok", "exit_code": 0}
    name, status = failure
    return {"steps": report, "job": f"failed at {name} (exit {status})", "exit_code": status}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON: {"pipefail": true, "steps": [...]}) from stdin and prints the report as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(run_job(case["steps"], case["pipefail"]), ensure_ascii=False))
