/**
 * Reference solution (never shipped to learners).
 * forEach ignores the promises its async callback returns, so the function returned
 * before any fee arrived. Collect the promises and await them all (the lookups are
 * independent, so they may run concurrently), then sum.
 */
async function settleMerchant(batch, gateway) {
  const nets = await Promise.all(
    batch.orders.map(async (order) => {
      const fee = await gateway.getFee(order.id);
      return order.amountCents - fee;
    })
  );

  return {
    merchantId: batch.merchantId,
    orderCount: batch.orders.length,
    netCents: nets.reduce((sum, net) => sum + net, 0),
  };
}
