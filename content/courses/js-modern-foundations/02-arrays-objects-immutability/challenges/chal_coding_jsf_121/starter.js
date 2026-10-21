/**
 * Summarise a list of orders for the admin dashboard - WITHOUT changing the list.
 *
 * The same `orders` array is rendered in the orders table, so this function must be pure:
 * do not sort it in place, do not add or change properties on the orders or their items,
 * do not push into any array you were given. Build new arrays and objects instead.
 *
 * An order looks like:
 *   { id: "A-1001", customer: "alice", status: "paid", items: [{ sku: "MUG", qty: 2, priceCents: 1250 }] }
 * Money is in integer cents, so totals are exact.
 *
 * summarizeOrders(orders) returns:
 *   - idsByStatus:     { [status]: string[] }  the ids of EVERY order (cancelled ones too),
 *                      grouped by status, in the order they appear in the input
 *   - totalByCustomer: { [customer]: number }  sum of qty * priceCents over all items of the
 *                      customer's orders, ignoring orders whose status is "cancelled";
 *                      a customer with only cancelled orders does not appear
 *   - ranking:         string[]  ids of the non-cancelled orders, sorted by order total,
 *                      largest first; equal totals by id, ascending ("A-1" before "A-2")
 *
 * An empty list gives { idsByStatus: {}, totalByCustomer: {}, ranking: [] }.
 * Useful tools: Object.groupBy, Object.entries / Object.fromEntries, map, filter, reduce, toSorted.
 *
 * @param {{ id: string, customer: string, status: string,
 *           items: { sku: string, qty: number, priceCents: number }[] }[]} orders
 * @returns {{ idsByStatus: Record<string, string[]>, totalByCustomer: Record<string, number>, ranking: string[] }}
 */
function summarizeOrders(orders) {
  // TODO: group ids by status, total per customer (skip "cancelled"), rank by order total.
  return { idsByStatus: {}, totalByCustomer: {}, ranking: [] };
}
