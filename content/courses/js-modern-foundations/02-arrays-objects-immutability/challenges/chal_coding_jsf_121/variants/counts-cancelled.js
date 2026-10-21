// Wrong: pure, but cancelled orders are counted in the totals and the ranking.
function summarizeOrders(orders) {
  const orderTotal = (order) => order.items.reduce((sum, item) => sum + item.qty * item.priceCents, 0);
  const idsByStatus = Object.fromEntries(
    Object.entries(Object.groupBy(orders, (order) => order.status))
      .map(([status, list]) => [status, list.map((order) => order.id)])
  );
  const totalByCustomer = orders.reduce((acc, order) => {
    acc[order.customer] = (acc[order.customer] ?? 0) + orderTotal(order);
    return acc;
  }, {});
  const ranking = orders
    .toSorted((a, b) => orderTotal(b) - orderTotal(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((order) => order.id);
  return { idsByStatus, totalByCustomer, ranking };
}
