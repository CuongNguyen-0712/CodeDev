// Wrong variant (the incident): toISOString() is always UTC, so the timeZone is ignored.
function groupByLocalDay(orders, timeZone) {
  const totals = {};
  for (const order of orders) {
    const day = new Date(order.createdAt).toISOString().slice(0, 10);
    totals[day] = (totals[day] ?? 0) + order.amount;
  }
  return totals;
}
