// @piece check-event: Answer a check
if (!Number.isInteger(event.estimate) || event.estimate <= 0) return { ok: false, reason: "invalid estimate", remaining: remaining() };
if (remaining() <= 0) return { ok: false, reason: "budget exceeded", remaining: remaining() };
return { ok: true, reason: null, remaining: remaining() };
