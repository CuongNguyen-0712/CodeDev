// @piece critical-section: Read, check and write the balance under the lock
const balance = await wallet.getBalance();
if (balance < amount) return { ok: false, balance };
await wallet.setBalance(balance - amount);
return { ok: true, balance: balance - amount };
