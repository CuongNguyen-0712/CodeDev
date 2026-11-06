// @piece classify-failure: Tell the breaker whether the menu service failed
b.record(now+waitedMs, status >= 400)
