// Wrong variant: validates the input, but adds dollars as floats and multiplies by 100 at the end.
function checkoutTotal(lines) {
  let total = 0;
  for (const { price, qty } of lines) {
    if (typeof price !== "string" || !/^\d+(\.\d{1,2})?$/.test(price)) throw new Error("Invalid price");
    const n = typeof qty === "string" && /^\d+$/.test(qty) ? Number(qty) : qty;
    if (!Number.isInteger(n) || n < 0) throw new Error("Invalid quantity");
    total += parseFloat(price) * n;
  }
  return { cents: total * 100, display: "$" + total.toFixed(2) };
}
