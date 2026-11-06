# @piece mark-saturated: When a resource counts as saturated
if wait is not None and wait > limit:
    saturated[name] = {"resource": name, "from_rate": step["rate"], "p95_wait_ms": wait}
