# @piece latency: Latency of each request
start, interval = run["start_ms"], run["interval_ms"]
return [done_ms - (start + i * interval) for i, (_seq, _sent_ms, done_ms) in enumerate(run["requests"])]
