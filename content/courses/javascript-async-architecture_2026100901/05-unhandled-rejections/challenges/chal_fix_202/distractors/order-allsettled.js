// @piece order: Create the order, reserve stock and finish
try {
  const order = await api.createOrder(cart);
  await Promise.allSettled(cart.items.map((item) => api.reserveStock(order.id, item.sku)));
  return { orderId: order.id, template: await templatePromise };
} finally {
  ui.setBusy(false);
}
