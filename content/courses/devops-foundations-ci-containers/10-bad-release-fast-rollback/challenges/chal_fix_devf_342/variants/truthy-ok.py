"""
Rice Rocket's checkout service answers the Kubernetes readiness probe (GET /ready) with the result
of readiness(snapshot). A pod gets traffic only while it answers 200. After the "health check
that said OK" incident, the team wrote this function so that a pod is ready only when its
configuration is complete and the services it depends on answer in time.

It still lets broken pods through. Read the rules, find what the code does differently, and fix it.

The snapshot is collected by the pod just before it answers the probe:

    {"required_config": ["DATABASE_URL", "PAYMENT_API_URL"],   # variables the app cannot run without
     "env": {"DATABASE_URL": "postgres://...", "PAYMENT_API_URL": "https://..."},   # all strings
     "timeout_ms": 500,                                          # slowest acceptable answer
     "checks": [{"name": "database", "ok": true, "latency_ms": 12},
                {"name": "payments", "ok": false, "latency_ms": 500, "error": "connection refused"}]}

Rules. Collect every problem, config problems first (in required_config order), then check
problems (in the order of the checks list):

  1. A required variable is not set when it is missing from env, or when its value is empty or
     only spaces:                                      "config DATABASE_URL is not set"
  2. For each check, look at "ok":
       - it must be the boolean true or false. Anything else (missing, null, the string "false",
         the number 1) is a broken check result:      "payments: invalid result"
       - false: the dependency failed. Use the "error" text, or "failed" when there is no error
         text or it is empty:                          "payments: connection refused"
       - true, but latency_ms is greater than timeout_ms. Exactly timeout_ms is still fine:
                                                       "database: slow (2400 ms > 500 ms)"
  3. The pod is ready when there are no problems. Return
         {"status": 200, "ready": true, "problems": []}
     or  {"status": 503, "ready": false, "problems": [...]}

Example: required_config ["DATABASE_URL"], env {"DATABASE_URL": ""}, timeout_ms 500,
checks [{"name": "database", "ok": true, "latency_ms": 2400}]
  -> {"status": 503, "ready": false,
      "problems": ["config DATABASE_URL is not set", "database: slow (2400 ms > 500 ms)"]}
"""
import json
import sys


def config_problems(required, env):
    problems = []
    for name in required:
        value = env.get(name)
        if value is None or value.strip() == "":
            problems.append(f"config {name} is not set")
    return problems


def check_problems(checks, timeout_ms):
    problems = []
    for check in checks:
        name = check["name"]
        if not check.get("ok"):
            problems.append(f"{name}: {check.get('error') or 'failed'}")
        elif check["latency_ms"] > timeout_ms:
            problems.append(f"{name}: slow ({check['latency_ms']} ms > {timeout_ms} ms)")
    return problems


def readiness(snapshot):
    problems = config_problems(snapshot["required_config"], snapshot["env"])
    problems += check_problems(snapshot["checks"], snapshot["timeout_ms"])
    ready = len(problems) == 0
    return {"status": 200 if ready else 503, "ready": ready, "problems": problems}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one snapshot (JSON) from stdin and prints the readiness answer as JSON.
if __name__ == "__main__":
    snapshot = json.load(sys.stdin)
    print(json.dumps(readiness(snapshot), ensure_ascii=False))
