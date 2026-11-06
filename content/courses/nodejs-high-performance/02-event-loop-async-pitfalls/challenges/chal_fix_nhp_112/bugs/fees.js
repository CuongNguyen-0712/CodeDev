// @piece fees: Get every order's net amount once its fee is known
let netCents = 0;

batch.orders.forEach(async (order) => {
  const fee = await gateway.getFee(order.id);
  netCents += order.amountCents - fee;
});
