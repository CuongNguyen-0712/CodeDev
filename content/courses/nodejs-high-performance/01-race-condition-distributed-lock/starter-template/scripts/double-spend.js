// Fires concurrent payments at the same wallet and prints what the API approved.
// Usage: npm run attack -- [requests=2] [amount=80000]
const BASE = process.env.API_URL || "http://localhost:3000";
const requests = Number(process.argv[2]) || 2;
const amount = Number(process.argv[3]) || 80_000;

const post = (path, body) => fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
});

await post("/reset", { walletId: "wallet-42", balance: 100_000 });

const responses = await Promise.all(
    Array.from({ length: requests }, () => post("/payments", { walletId: "wallet-42", amount }).then(async (r) => ({ status: r.status, body: await r.json() })))
);

const approved = responses.filter((r) => r.status === 200).length;
const wallet = await (await fetch(`${BASE}/wallets/wallet-42`)).json();

console.table(responses.map((r, i) => ({ request: i + 1, status: r.status, ...r.body })));
console.log(`approved ${approved} x ${amount} = ${approved * amount}, wallet balance now ${wallet.balance}`);
console.log(approved * amount > 100_000 ? "DOUBLE SPEND: more money approved than the wallet held." : "Consistent: approvals fit the starting balance.");
