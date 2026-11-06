# @piece latency: Latency of each request
# Latency of a request = when its response arrived - when it was sent.
return [done_ms - sent_ms for _seq, sent_ms, done_ms in run["requests"]]
