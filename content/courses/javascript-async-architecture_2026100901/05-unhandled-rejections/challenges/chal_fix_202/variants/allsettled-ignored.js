// Wrong variant: no unhandled rejections any more - because allSettled swallows the failed
// reservation. The order is confirmed although an item is out of stock.
async function placeOrder(cart, { api, analytics, ui }) {
  ui.setBusy(true);
  try {
    analytics.track("checkout_submitted").catch(() => {});
    const templatePromise = api.loadReceiptTemplate().catch(() => "plain");
    const order = await api.createOrder(cart);
    await Promise.allSettled(cart.items.map((item) => api.reserveStock(order.id, item.sku)));
    return { orderId: order.id, template: await templatePromise };
  } finally {
    ui.setBusy(false);
  }
}
