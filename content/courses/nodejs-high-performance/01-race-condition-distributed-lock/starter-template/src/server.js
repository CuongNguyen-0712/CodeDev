import http from "node:http";
import Redis from "ioredis";

import * as repo from "./walletRepo.js";
import { createLock } from "./lock.js";

const PORT = Number(process.env.PORT) || 3000;
const USE_LOCK = process.env.USE_LOCK === "1";
const redis = USE_LOCK ? new Redis(process.env.REDIS_URL || "redis://localhost:6379") : null;
const lock = USE_LOCK ? createLock(redis) : null;

// BUG (the lesson's scenario): check-then-act across an await. Two concurrent
// payments both read the old balance and both get approved.
async function debit(walletId, amount) {
    const wallet = await repo.findById(walletId);
    if (!wallet) return { status: 404, body: { error: "WALLET_NOT_FOUND" } };
    if (wallet.balance < amount) return { status: 409, body: { error: "INSUFFICIENT_FUNDS", balance: wallet.balance } };

    await repo.save({ ...wallet, balance: wallet.balance - amount });
    return { status: 200, body: { ok: true, balance: wallet.balance - amount } };
}

async function debitWithLock(walletId, amount) {
    const key = `lock:wallet:${walletId}`;
    const token = await lock.acquire(key, 5_000);
    if (!token) return { status: 409, body: { error: "PAYMENT_IN_PROGRESS" } };
    try {
        return await debit(walletId, amount);
    } finally {
        await lock.release(key, token);
    }
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        let raw = "";
        req.on("data", (chunk) => { raw += chunk; });
        req.on("end", () => {
            try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); }
        });
    });
}

const server = http.createServer(async (req, res) => {
    const reply = (status, body) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
    };

    try {
        if (req.method === "POST" && req.url === "/payments") {
            const { walletId = "wallet-42", amount } = await readJson(req);
            const result = USE_LOCK ? await debitWithLock(walletId, Number(amount)) : await debit(walletId, Number(amount));
            return reply(result.status, result.body);
        }
        if (req.method === "GET" && req.url.startsWith("/wallets/")) {
            const wallet = await repo.findById(req.url.split("/")[2]);
            return wallet ? reply(200, wallet) : reply(404, { error: "WALLET_NOT_FOUND" });
        }
        if (req.method === "POST" && req.url === "/reset") {
            const { walletId = "wallet-42", balance = 100_000 } = await readJson(req);
            repo.reset(walletId, Number(balance));
            return reply(200, { ok: true });
        }
        return reply(404, { error: "NOT_FOUND" });
    } catch (error) {
        return reply(500, { error: error.message });
    }
});

server.listen(PORT, () => {
    console.log(`wallet API on http://localhost:${PORT} (lock ${USE_LOCK ? "ON" : "OFF"})`);
});
