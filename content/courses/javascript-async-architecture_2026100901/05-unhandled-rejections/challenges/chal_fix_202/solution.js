/**
 * Reference solution (never shipped to learners).
 */
async function placeOrder(cart, { api, analytics, ui }) {
  ui.setBusy(true);
  try {
    // Fire-and-forget, but never unhandled: the handler is attached in the same expression.
    analytics.track("checkout_submitted").catch(() => {});

    // Prefetch in parallel; the fallback handler is attached immediately, not after the next await.
    const templatePromise = api.loadReceiptTemplate().catch(() => "plain");

    const order = await api.createOrder(cart);
    await Promise.all(cart.items.map((item) => api.reserveStock(order.id, item.sku)));

    return { orderId: order.id, template: await templatePromise };
  } finally {
    ui.setBusy(false);
  }
}
