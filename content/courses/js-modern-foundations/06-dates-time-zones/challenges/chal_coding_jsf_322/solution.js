/**
 * Reference solution (never shipped to learners).
 */
function groupByLocalDay(orders, timeZone) {
  // One formatter for the whole report: creating Intl objects is the slow part.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const totals = {};

  for (const order of orders) {
    const parts = {};
    for (const { type, value } of formatter.formatToParts(new Date(order.createdAt))) parts[type] = value;
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    totals[day] = (totals[day] ?? 0) + order.amount;
  }

  return totals;
}
