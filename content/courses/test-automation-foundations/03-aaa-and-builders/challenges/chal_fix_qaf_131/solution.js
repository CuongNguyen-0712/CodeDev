/**
 * Reference solution (never shipped to learners).
 */
function anOrder(overrides = {}) {
  const fresh = structuredClone(overrides);          // copy: never share with (or change) the caller's object
  const order = { ...structuredClone(DEFAULTS), ...fresh };
  order.customer = { ...structuredClone(DEFAULTS.customer), ...fresh.customer };   // merge, not replace
  order.id = fresh.id ?? `ORD-${nextId++}`;
  if (fresh.totalCents === undefined) order.totalCents = totalOf(order);
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
