// Harness: Fix the lost-update bug in a locked debit
// Fires all debits at once against an in-memory wallet whose reads and writes take
// time (like a database round-trip), with a per-key async mutex as the lock.
// Output: how many debits succeeded / were rejected, and the balance at the end.
async function __harness(input) {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    let balance = Number(input.balance) || 0;
    const wallet = {
        id: "wallet-42",
        async getBalance() {
            await delay(5);
            return balance;
        },
        async setBalance(value) {
            await delay(5);
            balance = value;
        },
    };

    // FIFO mutex per key: the next holder starts only after the previous fn settled.
    const tails = new Map();
    const locks = {
        async withLock(key, fn) {
            const previous = tails.get(key) || Promise.resolve();
            let release;
            const held = new Promise((resolve) => { release = resolve; });
            const tail = previous.then(() => held);
            tails.set(key, tail);

            await previous;
            try {
                return await fn();
            } finally {
                release();
                if (tails.get(key) === tail) tails.delete(key);
            }
        },
    };

    const amounts = Array.isArray(input.amounts) ? input.amounts : [];
    const results = await Promise.all(amounts.map((amount) => debit(locks, wallet, amount)));

    // Let any promise the solution forgot to await settle before reading the balance.
    await delay(100);

    return {
        succeeded: results.filter((r) => r && r.ok === true).length,
        rejected: results.filter((r) => r && r.ok === false).length,
        finalBalance: balance,
    };
}
