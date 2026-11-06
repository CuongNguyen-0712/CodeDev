// @piece rotate: Rotate to the next token in the family
const next = issue(deps, deps.newId("rt"), deps.newId("fam"), row.userId, row.deviceId, familyExpiresAt);
deps.store.update(row.id, { usedAt: now, replacedBy: next.id });
return { ok: true, ...next };
