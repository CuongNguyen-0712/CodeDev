// Harness: Fix the idempotent consumer of WalletCredited events
// An in-memory "PostgreSQL" with READ COMMITTED transactions and a primary key on
// processed_messages.message_id:
//   - writes inside a transaction become visible to others only on commit; a throw rolls back
//   - a concurrent INSERT of the same message_id waits for the other transaction to finish,
//     then reports a conflict (if it committed) or proceeds (if it rolled back)
// Every query takes a couple of real ms so concurrent deliveries interleave. The broker
// delivers messages at least once; each step is a group of deliveries fired at the same time.
// Output: per delivery "applied" | "duplicate" | "error" (the handler threw -> broker will
// redeliver) | "invalid:<...>", the final wallet balances and how many messages are recorded.
async function __harness(input) {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const committedProcessed = new Set();
    const balances = {};
    const rowLocks = new Map(); // message_id -> Promise resolved when the holding tx ends
    const failCredits = new Set(input.failCredits || []); // ordinal numbers of creditWallet calls that fail
    let creditCalls = 0;

    async function transaction(fn) {
        const inserted = new Set();
        const credits = [];
        const releases = [];
        let open = true;
        const ensureOpen = () => {
            if (!open) throw new Error("transaction already finished");
        };

        const tx = {
            async isProcessed(messageId) {
                ensureOpen();
                await delay(2);
                return committedProcessed.has(messageId) || inserted.has(messageId);
            },
            // INSERT INTO processed_messages (message_id) VALUES ($1) ON CONFLICT DO NOTHING
            // -> true when the row was inserted, false when the id already exists
            async insertProcessed(messageId) {
                ensureOpen();
                await delay(2);
                for (;;) {
                    if (committedProcessed.has(messageId) || inserted.has(messageId)) return false;
                    const lock = rowLocks.get(messageId);
                    if (!lock) break;
                    await lock; // another transaction inserted it and has not finished yet
                }
                let release;
                rowLocks.set(messageId, new Promise((resolve) => { release = resolve; }));
                releases.push(() => { rowLocks.delete(messageId); release(); });
                inserted.add(messageId);
                return true;
            },
            // UPDATE wallets SET balance = balance + $2 WHERE id = $1
            async creditWallet(walletId, amount) {
                ensureOpen();
                const ordinal = ++creditCalls;
                await delay(2);
                if (failCredits.has(ordinal)) {
                    throw Object.assign(new Error("connection terminated unexpectedly"), { code: "57P01", injected: true });
                }
                credits.push([walletId, amount]);
            },
        };

        try {
            const result = await fn(tx);
            open = false;
            for (const id of inserted) committedProcessed.add(id);
            for (const [walletId, amount] of credits) balances[walletId] = (balances[walletId] || 0) + amount;
            return result;
        } catch (error) {
            open = false;
            throw error;
        } finally {
            for (const release of releases) release();
        }
    }

    // Autocommit helpers: each call is its own one-statement transaction.
    const db = {
        transaction,
        isProcessed: (id) => transaction((tx) => tx.isProcessed(id)),
        insertProcessed: (id) => transaction((tx) => tx.insertProcessed(id)),
        creditWallet: (walletId, amount) => transaction((tx) => tx.creditWallet(walletId, amount)),
    };

    const messages = input.messages || {};
    const deliver = async (id) => {
        const message = { id, type: "WalletCredited", ...messages[id] };
        try {
            const outcome = await handleWalletCredited(db, message);
            return outcome === "applied" || outcome === "duplicate" ? outcome : `invalid:${JSON.stringify(outcome)}`;
        } catch (error) {
            return error && error.injected ? "error" : `invalid:${error && error.message}`;
        }
    };

    const results = [];
    for (const group of input.deliveries || []) {
        results.push(await Promise.all(group.map(deliver)));
    }

    await delay(20);
    return { results, balances, processed: committedProcessed.size };
}
