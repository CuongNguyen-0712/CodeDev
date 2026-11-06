// @piece record-half-open: Half-open: reopen on a failure, close after enough successes
if b.state == "half-open" {
	if failed {
		b.successes = 0
		return
	}
	b.successes++
	if b.successes >= b.cfg.SuccessThreshold {
		b.moveTo("closed", now)
		b.failures = 0
	}
	return
}
