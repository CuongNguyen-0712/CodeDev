// @piece order: Create the order, reserve stock and finish
const order = await api.createOrder(cart);
await Promise.all(cart.items.map((item) => api.reserveStock(order.id, item.sku)));
const template = await templatePromise;
ui.setBusy(false);
return { orderId: order.id, template };
