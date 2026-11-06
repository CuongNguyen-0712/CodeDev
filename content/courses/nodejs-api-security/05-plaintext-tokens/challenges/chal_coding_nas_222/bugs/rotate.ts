// @piece rotate: Answer with the next token of the family
// keep the session alive: the same refresh token, valid for another ttlMs
const expiresAt = deps.now() + deps.ttlMs;
deps.store.update(row.id, { expiresAt });
return { ok: true, token: presented, id: row.id, familyId: row.familyId, expiresAt };
