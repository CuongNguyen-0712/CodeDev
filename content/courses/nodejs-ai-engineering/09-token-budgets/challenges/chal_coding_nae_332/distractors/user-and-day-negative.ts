// @piece user-and-day: Find the learner, the day key and what is left
const user = users.get(event.userId);
if (!user) return { ok: false, reason: "unknown user", remaining: null };
const key = `${user.id}|${localDay(event.at, user.utcOffsetMinutes)}`;
const remaining = () => input.dailyTokens[user.plan] - (usedByDay.get(key) ?? 0);
