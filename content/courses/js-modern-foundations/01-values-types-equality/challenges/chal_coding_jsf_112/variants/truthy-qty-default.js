// Wrong variant: exact cents, but the quantity defaults with || so a quantity of 0 becomes 1.
function checkoutTotal(lines) {
  let cents = 0;
  for (const { price, qty } of lines) {
    const match = typeof price === "string" ? /^(\d+)(?:\.(\d{1,2}))?$/.exec(price) : null;
    if (!match) throw new Error("Invalid price");
    const priceCents = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
    const n = Number(qty) || 1;
    if (!Number.isInteger(n) || n < 0) throw new Error("Invalid quantity");
    cents += priceCents * n;
  }
  return { cents, display: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100) };
}
