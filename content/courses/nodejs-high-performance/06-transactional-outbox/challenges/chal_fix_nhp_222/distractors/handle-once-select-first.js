// @piece handle-once: Record the message and credit the wallet exactly once
return db.transaction(async (tx) => {
  if (await tx.isProcessed(message.id)) return "duplicate";
  await tx.insertProcessed(message.id);
  await tx.creditWallet(message.walletId, message.amount);
  return "applied";
});
