// Wrong variant: getFullYear/getMonth/getDate answer in the zone of the machine running the code,
// not in `timeZone`. The tests group the same orders in three zones, so no machine passes them all.
function groupByLocalDay(orders, timeZone) {
  const totals = {};
  for (const order of orders) {
    const date = new Date(order.createdAt);
    const day = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    totals[day] = (totals[day] ?? 0) + order.amount;
  }
  return totals;
}
