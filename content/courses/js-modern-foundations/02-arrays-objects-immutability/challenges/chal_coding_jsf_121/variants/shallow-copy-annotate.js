// Wrong: [...orders] copies the array, not the orders - writing order.total changes the caller's objects.
function summarizeOrders(orders) {
  const copy = [...orders];
  for (const order of copy) {
    order.total = order.items.reduce((sum, item) => sum + item.qty * item.priceCents, 0);
  }
  const idsByStatus = {};
  const totalByCustomer = {};
  for (const order of copy) {
    (idsByStatus[order.status] ??= []).push(order.id);
    if (order.status !== "cancelled") {
      totalByCustomer[order.customer] = (totalByCustomer[order.customer] ?? 0) + order.total;
    }
  }
  const ranking = copy
    .filter((order) => order.status !== "cancelled")
    .sort((a, b) => b.total - a.total || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((order) => order.id);
  return { idsByStatus, totalByCustomer, ranking };
}
