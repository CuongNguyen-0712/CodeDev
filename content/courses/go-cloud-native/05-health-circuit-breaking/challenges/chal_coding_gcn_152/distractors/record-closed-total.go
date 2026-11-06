// @piece record-closed: Closed: count failures in a row, open at the threshold
if !failed {
	return
}
b.failures++
if b.failures >= b.cfg.FailureThreshold {
	b.moveTo("open", now)
	b.openedAt = now
}
