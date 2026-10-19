// Wrong variant: every rejection is handled, but the spinner is only hidden on the happy path.
async function placeOrder(cart, { api, analytics, ui }) {
  ui.setBusy(true);
  analytics.track("checkout_submitted").catch(() => {});
  const templatePromise = api.loadReceiptTemplate().catch(() => "plain");
  const order = await api.createOrder(cart);
  await Promise.all(cart.items.map((item) => api.reserveStock(order.id, item.sku)));
  const template = await templatePromise;
  ui.setBusy(false);
  return { orderId: order.id, template };
}
