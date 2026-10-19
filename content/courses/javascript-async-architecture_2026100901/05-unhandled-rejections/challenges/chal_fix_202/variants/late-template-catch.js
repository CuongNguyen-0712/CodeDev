// Wrong variant: the fallback for the template is right, but the handler is attached only after
// the order and the reservations - when the template request fails early, its rejection sits
// without a handler for hundreds of milliseconds and is reported as unhandled.
async function placeOrder(cart, { api, analytics, ui }) {
  ui.setBusy(true);
  try {
    analytics.track("checkout_submitted").catch(() => {});
    const templatePromise = api.loadReceiptTemplate();
    const order = await api.createOrder(cart);
    await Promise.all(cart.items.map((item) => api.reserveStock(order.id, item.sku)));
    const template = await templatePromise.catch(() => "plain");
    return { orderId: order.id, template };
  } finally {
    ui.setBusy(false);
  }
}
