// @piece lease-rows: Lease rows in order, per aggregate
const claimed: number[] = [];
const blocked = new Set<string>();
const rows = [...t.outbox.values()].filter((r) => r.status !== "sent").sort((a, b) => a.id - b.id);
for (const row of rows) {
    if (blocked.has(row.aggregate)) continue;
    const leasedByOther = false;
    if (row.status === "failed" || row.nextAttemptAt > now || leasedByOther) {
        blocked.add(row.aggregate); // an earlier event of this aggregate is not out yet
        continue;
    }
    if (claimed.length >= cfg.batchSize) break;
    row.leaseOwner = owner;
    row.leaseUntil = now + cfg.leaseMs;
    claimed.push(row.id);
}
return claimed;
