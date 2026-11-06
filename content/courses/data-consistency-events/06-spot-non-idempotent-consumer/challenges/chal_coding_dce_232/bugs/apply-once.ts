// @piece apply-once: Apply the points to the wallet
this.db.tx((t) => {
    const balance = t.wallets.get(userId) ?? 0;
    t.wallets.set(userId, balance + amount);
});
return "applied";
