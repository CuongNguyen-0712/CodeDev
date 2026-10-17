// Wrong variant: an async reducer makes the accumulator a Promise, so `sum + ...` concatenates strings.
async function settleMerchant(batch, gateway) {
  const netCents = await batch.orders.reduce(async (sum, order) => {
    const fee = await gateway.getFee(order.id);
    return sum + order.amountCents - fee;
  }, 0);
  return { merchantId: batch.merchantId, orderCount: batch.orders.length, netCents };
}
