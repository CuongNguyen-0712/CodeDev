// Wrong variant: the customer is merged and the ids reset, but the shallow spread still hands every
// build the SAME lines array as DEFAULTS (or as the overrides): one push leaks into later tests.
function anOrder(overrides = {}) {
  const order = { ...DEFAULTS, ...overrides };
  order.customer = { ...DEFAULTS.customer, ...overrides.customer };
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
