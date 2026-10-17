// Wrong variant: atomic and race-free, but swallows the failure and acks the message as
// "applied" - the broker never redelivers it and the credit is lost.
async function handleWalletCredited(db, message) {
  try {
    return await db.transaction(async (tx) => {
      if (!(await tx.insertProcessed(message.id))) return "duplicate";
      await tx.creditWallet(message.walletId, message.amount);
      return "applied";
    });
  } catch (error) {
    return "applied";
  }
}
