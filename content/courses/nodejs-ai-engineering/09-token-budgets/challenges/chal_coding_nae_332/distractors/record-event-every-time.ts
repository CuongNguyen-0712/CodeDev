// @piece record-event: Record usage once per request
if (!Number.isInteger(event.used) || event.used < 0) return { ok: false, reason: "invalid usage", remaining: remaining() };
const requestKey = `${user.id}|${event.requestId}`;
                recorded.add(requestKey);
usedByDay.set(key, (usedByDay.get(key) ?? 0) + event.used);
return { ok: true, reason: null, remaining: remaining() };
