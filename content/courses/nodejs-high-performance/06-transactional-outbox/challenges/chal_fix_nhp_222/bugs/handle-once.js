// @piece handle-once: Record the message and credit the wallet exactly once
if (await db.isProcessed(message.id)) {
  return "duplicate";
}

await db.insertProcessed(message.id);
await db.creditWallet(message.walletId, message.amount);
return "applied";
