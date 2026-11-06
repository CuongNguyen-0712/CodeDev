// @piece critical-section: Read, check and write the balance under the lock
let result;

await locks.withLock(wallet.id, async () => {
  wallet.getBalance().then(async (balance) => {
    if (balance < amount) {
      result = { ok: false, balance };
      return;
    }

    await wallet.setBalance(balance - amount);
    result = { ok: true, balance: balance - amount };
  });
});

return result;
