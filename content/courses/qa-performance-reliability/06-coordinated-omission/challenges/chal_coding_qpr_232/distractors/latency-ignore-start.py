# @piece latency: Latency of each request
interval = run["interval_ms"]
return [done_ms - seq * interval for seq, _sent_ms, done_ms in run["requests"]]
