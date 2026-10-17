/**
 * Computes tonight's settlement for one merchant: the sum of (amount - gateway fee)
 * over all of the merchant's orders, in integer cents. Fees are looked up one order
 * at a time from the payment gateway.
 *
 * BUG: since the "make it faster" refactor, the settlement report says netCents = 0
 * for every merchant, although orderCount is right and the gateway logs show every
 * fee lookup succeeding. The payout job then pays merchants nothing.
 *
 * Expected: resolve only after every fee is known, with
 *   { merchantId, orderCount, netCents }  where netCents = sum(amountCents - fee)
 *
 * @param {{ merchantId: string, orders: Array<{ id: string, amountCents: number }> }} batch
 * @param {{ getFee(orderId: string): Promise<number> }} gateway
 * @returns {Promise<{ merchantId: string, orderCount: number, netCents: number }>}
 */
async function settleMerchant(batch, gateway) {
  let netCents = 0;

  batch.orders.forEach(async (order) => {
    const fee = await gateway.getFee(order.id);
    netCents += order.amountCents - fee;
  });

  return {
    merchantId: batch.merchantId,
    orderCount: batch.orders.length,
    netCents,
  };
}
