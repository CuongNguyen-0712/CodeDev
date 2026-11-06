# @piece flaky-tests: Tell flaky tests from failing ones
if any(a["outcome"] == "failed" for a in attempts) and len(attempts) > 1:
    flaky.append(result["test"])
if attempts[-1]["outcome"] == "passed":
    continue
