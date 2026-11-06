// @piece rotate: Answer with the next token of the family
const token = deps.randomBytes(32).toString("base64url");
const id = deps.newId("rt");
const expiresAt = deps.now() + deps.ttlMs;
deps.store.insert({
    id, familyId: row.familyId, userId: row.userId, deviceId: row.deviceId,
    token: null, tokenHash: createHash("sha256").update(token).digest("hex"),
    createdAt: deps.now(), expiresAt, usedAt: null, revokedAt: null, replacedBy: null,
});
return { ok: true, token, id, familyId: row.familyId, expiresAt };
