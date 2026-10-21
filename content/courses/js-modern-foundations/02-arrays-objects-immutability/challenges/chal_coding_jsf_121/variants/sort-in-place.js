// Wrong: the numbers are right, but .sort() reorders the caller's array - the table the UI shows.
function summarizeOrders(orders) {
  const orderTotal = (order) => order.items.reduce((sum, item) => sum + item.qty * item.priceCents, 0);
  const idsByStatus = {};
  const totalByCustomer = {};
  for (const order of orders) {
    (idsByStatus[order.status] ??= []).push(order.id);
    if (order.status === "cancelled") continue;
    totalByCustomer[order.customer] = (totalByCustomer[order.customer] ?? 0) + orderTotal(order);
  }
  const ranking = orders
    .sort((a, b) => orderTotal(b) - orderTotal(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter((order) => order.status !== "cancelled")
    .map((order) => order.id);
  return { idsByStatus, totalByCustomer, ranking };
}
