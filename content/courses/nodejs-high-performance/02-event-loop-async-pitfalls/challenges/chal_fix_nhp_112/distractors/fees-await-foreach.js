// @piece fees: Get every order's net amount once its fee is known
const nets = [];
await batch.orders.forEach(async (order) => {
  const fee = await gateway.getFee(order.id);
  nets.push(order.amountCents - fee);
});
