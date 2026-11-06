// @piece find-and-state: Find the token and check its state
if (typeof presented !== "string" || !TOKEN_FORMAT.test(presented)) return { ok: false, reason: "malformed" };
const hash = sha256Hex(presented);
const row = deps.store.findByHash(hash);
if (!row || !timingSafeEqual(Buffer.from(row.tokenHash, "hex"), Buffer.from(hash, "hex"))) return { ok: false, reason: "unknown" };
if (row.usedAt !== null) return { ok: false, reason: "used" };
if (row.revokedAt !== null) return { ok: false, reason: "revoked" };
