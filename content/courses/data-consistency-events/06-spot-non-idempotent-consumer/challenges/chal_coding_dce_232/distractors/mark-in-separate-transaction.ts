// @piece apply-once: Apply the points to the wallet
// the dedup check, the inbox row and the balance change commit together or not at all
const seen = this.db.tx((t) => {
    if (t.processed_events.has(msg.id)) return true;
    t.processed_events.set(msg.id, clock.now);
    return false;
});
if (seen) return "duplicate";
this.db.tx((t) => {
    t.wallets.set(userId, (t.wallets.get(userId) ?? 0) + amount);
});
return "applied";
