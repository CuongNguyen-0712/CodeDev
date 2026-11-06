// @piece find-row: Find the row of the presented token
const hash = createHash("sha256").update(presented).digest("hex");
const row = deps.store.findByHash(hash);
if (!row) return { ok: false, reason: "unknown" };
