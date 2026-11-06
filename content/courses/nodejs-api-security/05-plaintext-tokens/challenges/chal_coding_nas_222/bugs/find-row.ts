// @piece find-row: Find the row of the presented token
const row = deps.store.findByPlainToken(presented);
if (!row || row.token !== presented) return { ok: false, reason: "unknown" };
