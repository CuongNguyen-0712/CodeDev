/**
 * Total a shopping cart exactly, in integer cents.
 *
 * Each line is { price, qty } as it arrives from a form or a JSON API:
 *   - price  a STRING with a plain amount in dollars: digits, optionally followed by a dot and
 *            one or two digits ("5", "4.5", "19.99", "1299.00"). Anything else is invalid:
 *            "", "19.99abc", "19.999", "-5", "1e3", "NaN", or a price that is not a string.
 *   - qty    a whole, non-negative quantity, either as a string of digits ("0", "2") or as a
 *            number (0, 3). Invalid: "", "1.5", "abc", -1, 1.5, NaN, a missing qty.
 *            A quantity of 0 is valid and counts as ZERO items - never as 1.
 *
 * Returns { cents, display }:
 *   - cents    the total as an integer number of cents (0.10 + 0.20 -> 30, never 30.000000000000004)
 *   - display  the total formatted as US dollars, en-US style: "$0.30", "$54.98", "$1,299.21"
 *
 * If ANY line is invalid, throw an Error (any Error type) instead of returning a total:
 * a cart with one bad line must never be charged.
 *
 * Do not convert prices with parseFloat(price) * 100 - convert the dollars and the cents
 * parts of the string separately, so the result is exact.
 *
 * @param {{ price: unknown, qty: unknown }[]} lines
 * @returns {{ cents: number, display: string }}
 */
function checkoutTotal(lines) {
  // TODO: parse every price into cents, validate every qty, add up price * qty in cents,
  // then format the total once, at the end.
  return { cents: 0, display: "$0.00" };
}
