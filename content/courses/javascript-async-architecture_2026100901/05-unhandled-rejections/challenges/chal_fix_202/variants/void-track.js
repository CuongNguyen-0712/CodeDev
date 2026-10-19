// Wrong variant: `void` only tells the linter "I meant not to await this".
// It attaches no handler - a blocked analytics call is still an unhandled rejection.
async function placeOrder(cart, { api, analytics, ui }) {
  ui.setBusy(true);
  try {
    void analytics.track("checkout_submitted");
    const templatePromise = api.loadReceiptTemplate().catch(() => "plain");
    const order = await api.createOrder(cart);
    await Promise.all(cart.items.map((item) => api.reserveStock(order.id, item.sku)));
    return { orderId: order.id, template: await templatePromise };
  } finally {
    ui.setBusy(false);
  }
}
