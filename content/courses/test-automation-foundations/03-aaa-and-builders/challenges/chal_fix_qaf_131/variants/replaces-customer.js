// Wrong variant: every build is a deep copy, but the customer override replaces the whole default
// customer: anOrder({ customer: { country: "VN" } }) has no name and no email.
function anOrder(overrides = {}) {
  const order = { ...structuredClone(DEFAULTS), ...structuredClone(overrides) };
  order.id = overrides.id ?? `ORD-${nextId++}`;
  if (overrides.totalCents === undefined) order.totalCents = totalOf(order);
  return order;
}

let nextId = 1;

function resetIds() {
  nextId = 1;
}

const DEFAULTS = {
  id: "ORD-0",
  currency: "USD",
  status: "pending",
  customer: { name: "Lan Tran", email: "lan@example.com", country: "US" },
  lines: [{ sku: "MUG-01", qty: 2, priceCents: 1250 }],
  shippingCents: 499,
  totalCents: 2999,
};

function totalOf(order) {
  const items = order.lines.reduce((sum, line) => sum + line.qty * line.priceCents, 0);
  return items + order.shippingCents;
}
