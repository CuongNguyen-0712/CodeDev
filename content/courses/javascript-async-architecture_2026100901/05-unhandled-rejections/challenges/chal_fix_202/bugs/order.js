// @piece order: Create the order, reserve stock and finish
const order = await api.createOrder(cart);

cart.items.forEach(async (item) => {
  await api.reserveStock(order.id, item.sku);
});

const template = await templatePromise;
ui.setBusy(false);
return { orderId: order.id, template };
