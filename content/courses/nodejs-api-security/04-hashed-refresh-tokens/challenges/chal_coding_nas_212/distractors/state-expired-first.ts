// @piece state-checks: Revoked and expired rows
if (deps.now() >= row.expiresAt) return reject("expired", row.id);
if (row.revokedAt !== null) return reject("revoked", row.id);
