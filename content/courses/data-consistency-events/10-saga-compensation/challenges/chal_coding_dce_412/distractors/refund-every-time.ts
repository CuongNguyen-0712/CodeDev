// @piece refund-action: Refund a captured payment, once
const p = t.payments.get(o.sagaId);
if (!p) return;
p.status = "refunded";
if (p.method === "points") t.wallets.set(p.userId, (t.wallets.get(p.userId) ?? 0) + p.amount);
