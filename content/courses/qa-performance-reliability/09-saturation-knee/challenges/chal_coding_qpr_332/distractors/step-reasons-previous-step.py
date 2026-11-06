# @piece step-reasons: The rules this step breaks
if row["achieved_rps"] / row["offered_rps"] < case["min_throughput_ratio"]:
    reasons.append("throughput")
if row["p95_ms"] > case["max_p95_factor"] * rows[max(i - 1, 0)]["p95_ms"]:
    reasons.append("latency")
if row["errors"] / row["requests"] > case["max_error_rate"]:
    reasons.append("errors")
