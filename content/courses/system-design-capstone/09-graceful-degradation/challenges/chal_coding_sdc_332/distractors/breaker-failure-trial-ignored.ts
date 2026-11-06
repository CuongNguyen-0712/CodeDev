// @piece breaker-failure: What a failed call does to the breaker
if (this.state(now) === "half-open") return;
this.failures++;
if (this.failures >= this.failureThreshold) this.openedAt = now;
