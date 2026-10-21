// Wrong variant: parses prices with parseFloat and guards with === NaN, which is never true,
// so "19.99abc" (parsed as 19.99) and "" (parsed as NaN) slip through.
function checkoutTotal(lines) {
  let cents = 0;
  for (const { price, qty } of lines) {
    const value = parseFloat(price);
    if (value === NaN || value < 0) throw new Error("Invalid price");
    const n = typeof qty === "string" && /^\d+$/.test(qty) ? Number(qty) : qty;
    if (!Number.isInteger(n) || n < 0) throw new Error("Invalid quantity");
    cents += Math.round(value * 100) * n;
  }
  return { cents, display: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100) };
}
