# @piece throughput-in-flight: Throughput from the raw counts, and requests in flight
x = (Fraction(report["throughput_rps"]) if report["throughput_rps"] is not None
     else Fraction(report["requests"], report["duration_s"]))
latency = report["mean_latency_ms"]
in_flight = x * latency / 1000
