// Wrong variant: correct async/await, but no lock at all -> concurrent debits interleave.
async function debit(locks, wallet, amount) {
  const balance = await wallet.getBalance();
  if (balance < amount) return { ok: false, balance };
  await wallet.setBalance(balance - amount);
  return { ok: true, balance: balance - amount };
}
