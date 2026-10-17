// In-memory wallet "database". Every call waits a few milliseconds, like a real
// database round-trip - that await is exactly where concurrent requests interleave.
const wallets = new Map([["wallet-42", { id: "wallet-42", owner: "Lan", balance: 100_000 }]]);

const roundTrip = () => new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 30));

export async function findById(id) {
    await roundTrip();
    const wallet = wallets.get(id);
    return wallet ? { ...wallet } : null;
}

export async function save(wallet) {
    await roundTrip();
    wallets.set(wallet.id, { ...wallet });
}

export function reset(id, balance) {
    wallets.set(id, { ...(wallets.get(id) || { id, owner: "Lan" }), balance });
}
