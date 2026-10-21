// Wrong variant: defaults are cloned and the customer is merged - by writing the merged customer back
// into the caller's overrides object, and the order keeps the caller's lines array. A test that
// reuses its overrides object (or pushes into order.lines) changes data it never meant to touch.
function anOrder(overrides = {}) {
  overrides.customer = { ...DEFAULTS.customer, ...overrides.customer };
  const order = Object.assign(structuredClone(DEFAULTS), overrides);
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
