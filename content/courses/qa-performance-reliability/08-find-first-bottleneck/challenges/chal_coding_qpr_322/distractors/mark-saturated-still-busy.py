# @piece mark-saturated: When a resource counts as saturated
busy = resource.get("util", 0) >= BUSY_UTIL
if (busy or (wait is not None and wait > limit)) and name not in saturated:
    saturated[name] = {"resource": name, "from_rate": step["rate"], "p95_wait_ms": wait}
