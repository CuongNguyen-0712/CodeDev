/**
 * Reference solution (never shipped to learners).
 */
function checkoutTotal(lines) {
  let cents = 0;
  for (const line of lines) {
    cents += priceToCents(line.price) * toQuantity(line.qty);
  }
  return { cents, display: usd.format(cents / 100) };
}

const PRICE = /^(\d+)(?:\.(\d{1,2}))?$/;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function priceToCents(price) {
  const match = typeof price === "string" ? PRICE.exec(price) : null;
  if (!match) throw new RangeError(`Invalid price: ${JSON.stringify(price)}`);
  const [, dollars, fraction = ""] = match;
  return Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
}

function toQuantity(qty) {
  const n = typeof qty === "string" && /^\d+$/.test(qty) ? Number(qty) : qty;
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`Invalid quantity: ${JSON.stringify(qty)}`);
  return n;
}
