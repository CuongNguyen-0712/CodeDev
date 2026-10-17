// Wrong variant: awaiting forEach does nothing - forEach returns undefined, not a promise.
async function settleMerchant(batch, gateway) {
  let netCents = 0;
  await batch.orders.forEach(async (order) => {
    const fee = await gateway.getFee(order.id);
    netCents += order.amountCents - fee;
  });
  return { merchantId: batch.merchantId, orderCount: batch.orders.length, netCents };
}
