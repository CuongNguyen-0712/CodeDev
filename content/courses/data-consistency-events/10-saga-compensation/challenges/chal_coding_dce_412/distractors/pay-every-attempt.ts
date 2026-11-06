// @piece pay-action: Take the payment, once per saga
if (o.method === "points") {
    const balance = t.wallets.get(o.userId) ?? 0;
    if (balance < o.price) throw new BusinessError("insufficient points");
    t.wallets.set(o.userId, balance - o.price);
}
t.payments.set(o.sagaId, { userId: o.userId, method: o.method, amount: o.price, status: "captured" });
