/**
 * Debits `amount` from the wallet while holding the wallet's lock, so concurrent
 * payments for the same wallet cannot interleave.
 *
 * BUG: two payments that arrive together can still both read the old balance.
 * The lock is acquired and released correctly by `withLock` - look at what the
 * critical section hands back to it.
 *
 * @param {{ withLock(key: string, fn: () => Promise<any>): Promise<any> }} locks
 * @param {{ id: string, getBalance(): Promise<number>, setBalance(value: number): Promise<void> }} wallet
 * @param {number} amount
 * @returns {Promise<{ ok: boolean, balance: number }>}
 */
async function debit(locks, wallet, amount) {
  // @piece critical-section: Read, check and write the balance under the lock
  return locks.withLock(wallet.id, async () => {
    const balance = await wallet.getBalance();

    if (balance < amount) {
      return { ok: false, balance };
    }

    await wallet.setBalance(balance - amount);
    return { ok: true, balance: balance - amount };
  });
  // @end
}
