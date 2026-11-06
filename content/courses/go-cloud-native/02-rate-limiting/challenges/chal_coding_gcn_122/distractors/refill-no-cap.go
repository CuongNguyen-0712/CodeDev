// @piece refill: Refill for the time since the last call, capped at the burst
b.tokens += now.Sub(b.last).Seconds() * l.rate
b.last = now
