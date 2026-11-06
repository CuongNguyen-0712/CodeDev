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
    // [ ] Remember when the current slice of work started
    for (const item of items) {
        // [ ] Price one line and add it to the totals
        // [ ] Give the main thread back once the slice used its budget
        // [ ] Stop quietly when a newer recalculation replaced this one
    }
    // [ ] Show the new totals once, at the end
}
