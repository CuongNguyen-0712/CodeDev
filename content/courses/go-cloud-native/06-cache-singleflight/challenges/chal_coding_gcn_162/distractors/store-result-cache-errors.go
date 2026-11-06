// @piece store-result: Keep a success, fall back to the stale entry on a failure
c.entries[key] = entry{value: value, fetchedAt: c.now()}
