// @piece handle-once: Record the message and credit the wallet exactly once
const firstTime = await db.insertProcessed(message.id);
if (!firstTime) return "duplicate";
await db.creditWallet(message.walletId, message.amount);
return "applied";
