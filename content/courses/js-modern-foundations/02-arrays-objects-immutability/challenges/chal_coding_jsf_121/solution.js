function summarizeOrders(orders) {
  const orderTotal = (order) => order.items.reduce((sum, item) => sum + item.qty * item.priceCents, 0);

  const idsByStatus = Object.fromEntries(
    Object.entries(Object.groupBy(orders, (order) => order.status))
      .map(([status, list]) => [status, list.map((order) => order.id)])
  );

  // New, small objects: the input orders are never touched.
  const live = orders
    .filter((order) => order.status !== "cancelled")
    .map((order) => ({ id: order.id, customer: order.customer, total: orderTotal(order) }));

  // Mutating an accumulator this function created itself is fine.
  const totalByCustomer = live.reduce((acc, order) => {
    acc[order.customer] = (acc[order.customer] ?? 0) + order.total;
    return acc;
  }, {});

  const ranking = live
    .toSorted((a, b) => b.total - a.total || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((order) => order.id);

  return { idsByStatus, totalByCustomer, ranking };
}
