/**
 * Reference solution (never shipped to learners).
 * The dedupe row and the side effect commit together, and the primary key - not a prior
 * SELECT - decides which delivery wins.
 */
async function handleWalletCredited(db, message) {
  return db.transaction(async (tx) => {
    const firstTime = await tx.insertProcessed(message.id);
    if (!firstTime) return "duplicate";

    await tx.creditWallet(message.walletId, message.amount);
    return "applied";
  });
}
