/**
 * Places an order from the checkout page.
 *
 * Requirements:
 *   - ui.setBusy(true) at the start; ui.setBusy(false) when placeOrder is done - whether it
 *     succeeded or failed. A spinner that never stops is a bug.
 *   - analytics.track("checkout_submitted") is fire-and-forget: do not wait for it. It is
 *     best-effort - ad blockers make it reject, and that must never fail the order or show up
 *     as an unhandled rejection.
 *   - The receipt template is prefetched while the order is created (keep it parallel). It is
 *     optional: if api.loadReceiptTemplate() fails, use the template "plain".
 *   - Stock is reserved for every item with api.reserveStock(orderId, sku), in parallel. The order
 *     is confirmed only after ALL reservations succeeded; if one fails, placeOrder rejects with
 *     that error.
 *   - If api.createOrder() fails, placeOrder rejects with that error.
 *   - Resolves with { orderId, template }.
 *   - No promise created by placeOrder may ever reject without a handler.
 *
 * BUG: error tracking receives thousands of "Unhandled promise rejection" reports an hour,
 * some orders are confirmed although a reservation failed, and after a failed order the spinner
 * never stops. Fix placeOrder - keep the calls it makes, and keep the independent ones parallel.
 *
 * @param {{ items: { sku: string }[] }} cart
 * @param {{
 *   api: {
 *     createOrder(cart: object): Promise<{ id: string }>,
 *     reserveStock(orderId: string, sku: string): Promise<void>,
 *     loadReceiptTemplate(): Promise<string>,
 *   },
 *   analytics: { track(event: string): Promise<void> },
 *   ui: { setBusy(busy: boolean): void },
 * }} deps
 * @returns {Promise<{ orderId: string, template: string }>}
 */
async function placeOrder(cart, { api, analytics, ui }) {
  ui.setBusy(true);
  analytics.track("checkout_submitted");

  const templatePromise = api.loadReceiptTemplate();
  const order = await api.createOrder(cart);

  cart.items.forEach(async (item) => {
    await api.reserveStock(order.id, item.sku);
  });

  const template = await templatePromise;
  ui.setBusy(false);
  return { orderId: order.id, template };
}
