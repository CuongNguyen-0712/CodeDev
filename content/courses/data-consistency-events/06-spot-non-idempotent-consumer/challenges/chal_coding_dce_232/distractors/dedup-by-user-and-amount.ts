// @piece apply-once: Apply the points to the wallet
// the dedup check, the inbox row and the balance change commit together or not at all
const key = `${userId}:${amount}`;
return this.db.tx((t): Outcome => {
    if (t.processed_events.has(key)) return "duplicate";
    t.processed_events.set(key, clock.now);
    t.wallets.set(userId, (t.wallets.get(userId) ?? 0) + amount);
    return "applied";
});
