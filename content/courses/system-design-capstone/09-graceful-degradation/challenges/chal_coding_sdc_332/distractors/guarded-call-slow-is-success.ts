// @piece guarded-call: One call through the breaker, with its timeout
const breaker = this.breakers[name];
if (!breaker.allow(now)) return { ok: false, ms: 0, out: null };
const { timeoutMs } = this.config[name];
const out = op();
if (out.ok) {
    breaker.success(now);
    return { ok: true, ms: out.latencyMs, out };
}
breaker.failure(now);
return { ok: false, ms: out.ok ? timeoutMs : Math.min(out.latencyMs, timeoutMs), out: null };
