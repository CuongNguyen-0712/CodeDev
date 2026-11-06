# @piece step-reasons: The rules this step breaks
if row["achieved_rps"] / row["offered_rps"] <= case["min_throughput_ratio"]:
    reasons.append("throughput")
if row["p95_ms"] >= case["max_p95_factor"] * baseline:
    reasons.append("latency")
if row["errors"] / row["requests"] >= case["max_error_rate"]:
    reasons.append("errors")
