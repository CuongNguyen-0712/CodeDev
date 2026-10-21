// Wrong variant: a table of fixed UTC offsets. Right for Hanoi and UTC, wrong for New York for
// half of the year, because New York switches between UTC-4 (summer) and UTC-5 (winter).
const OFFSET_HOURS = { "Asia/Ho_Chi_Minh": 7, UTC: 0, "America/New_York": -5 };

function groupByLocalDay(orders, timeZone) {
  const totals = {};
  const offsetMs = (OFFSET_HOURS[timeZone] ?? 0) * 60 * 60 * 1000;
  for (const order of orders) {
    const shifted = new Date(new Date(order.createdAt).getTime() + offsetMs);
    const day = shifted.toISOString().slice(0, 10);
    totals[day] = (totals[day] ?? 0) + order.amount;
  }
  return totals;
}
