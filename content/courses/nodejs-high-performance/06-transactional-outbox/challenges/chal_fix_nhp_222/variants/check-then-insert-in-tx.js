// Wrong variant: one transaction, but the decision comes from a SELECT and the INSERT result is
// ignored. Two concurrent deliveries both see "not processed" and both credit.
async function handleWalletCredited(db, message) {
  return db.transaction(async (tx) => {
    if (await tx.isProcessed(message.id)) return "duplicate";
    await tx.insertProcessed(message.id);
    await tx.creditWallet(message.walletId, message.amount);
    return "applied";
  });
}
