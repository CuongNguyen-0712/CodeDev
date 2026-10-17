// Wrong variant: uses the INSERT result correctly, but commits it on its own before crediting.
// If the credit fails, the message is already marked processed and the money never arrives.
async function handleWalletCredited(db, message) {
  const firstTime = await db.insertProcessed(message.id);
  if (!firstTime) return "duplicate";
  await db.creditWallet(message.walletId, message.amount);
  return "applied";
}
