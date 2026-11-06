// cart/recalc.js: applying a promo code reprices every line of a large group order. Done in one
// loop it is a 600 ms long task on a budget phone, and every tap in the meantime waits.
// This version works in slices and gives the main thread back between them.
//
// items:  [{ sku, category, price, qty }]          promo: { category, percent } or null
// env:    { now(), budgetMs, price(item) -> line total (takes main-thread time),
//           yield() -> Promise (scheduler.yield(), or setTimeout(0) where it is missing),
//           signal: AbortSignal (aborted when a newer recalculation starts), render(totals) }
// return: { subtotal, discount, total }, or null when a newer recalculation replaced this one
async function recalcCart(items, promo, env) {
    let subtotal = 0;
    let discount = 0;
    // @piece slice-start: Remember when the current slice of work started
    let sliceStart = env.now();
    // @end
    for (const item of items) {
        // @piece price-item: Price one line and add it to the totals
        const line = env.price(item);
        subtotal += line;
        if (promo && promo.category === item.category) discount += Math.round((line * promo.percent) / 100);
        // @end
        // @piece yield-over-budget: Give the main thread back once the slice used its budget
        if (env.now() - sliceStart >= env.budgetMs) {
            await env.yield();
            sliceStart = env.now();
        }
        // @end
        // @piece stop-if-stale: Stop quietly when a newer recalculation replaced this one
        if (env.signal.aborted) return null;
        // @end
    }
    // @piece render-once: Show the new totals once, at the end
    const totals = { subtotal, discount, total: subtotal - discount };
    env.render(totals);
    return totals;
    // @end
}
