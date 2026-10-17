/**
 * Reference solution (never shipped to learners).
 * The critical section must return/await the whole read-check-write, so the lock is
 * only released after the new balance is written.
 */
async function debit(locks, wallet, amount) {
  return locks.withLock(wallet.id, async () => {
    const balance = await wallet.getBalance();

    if (balance < amount) {
      return { ok: false, balance };
    }

    await wallet.setBalance(balance - amount);
    return { ok: true, balance: balance - amount };
  });
}
