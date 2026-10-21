/**
 * Daily sales report: total the orders per CALENDAR DAY in the shop's time zone.
 *
 * groupByLocalDay(orders, timeZone)
 *   - orders:   [{ createdAt: string, amount: number }, ...]
 *               createdAt is an ISO 8601 string that names its instant without ambiguity:
 *               "2026-10-20T23:30:00.000Z", "2026-10-21T06:30:00+07:00" or a date-only
 *               "2026-10-21" (which JavaScript reads as midnight UTC).
 *               amount is an integer (VND, or cents), so plain + is exact.
 *   - timeZone: an IANA time zone name, e.g. "Asia/Ho_Chi_Minh", "UTC", "America/New_York".
 *
 * Returns a plain object { "YYYY-MM-DD": total, ... } with one key per calendar day that has at
 * least one order, where the day is the date ON THE WALL CLOCK of `timeZone` at the moment the
 * order was created. No orders -> {}.
 *
 * Example: an order at "2026-10-20T23:30:00Z" belongs to "2026-10-21" in Asia/Ho_Chi_Minh
 * (06:30 there), to "2026-10-20" in UTC and to "2026-10-20" in America/New_York (19:30).
 *
 * Rules:
 *   - Use Intl.DateTimeFormat with the timeZone option (formatToParts gives you the year, month
 *     and day as separate parts). Do not hard-code offsets: New York is UTC-4 in summer and
 *     UTC-5 in winter.
 *   - Do not use toISOString(), getDate() / getMonth() or toLocaleDateString() without a
 *     timeZone: they answer in UTC or in the zone of the machine that runs the code.
 *
 * @param {{ createdAt: string, amount: number }[]} orders
 * @param {string} timeZone
 * @returns {Record<string, number>}
 */
function groupByLocalDay(orders, timeZone) {
  const totals = {};

  // TODO: for every order, find its calendar day (YYYY-MM-DD) in `timeZone`
  // and add its amount to totals[day].

  return totals;
}
