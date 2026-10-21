/**
 * Test data builder for orders, used by every order test in the shop.
 *
 *   anOrder(overrides = {})  returns a NEW, valid order every call.
 *   resetIds()               makes the next generated id "ORD-1" again (tests call it in beforeEach).
 *
 * Default order (what anOrder() returns right after resetIds()):
 *   {
 *     id: "ORD-1",
 *     currency: "USD",
 *     status: "pending",
 *     customer: { name: "Lan Tran", email: "lan@example.com", country: "US" },
 *     lines: [{ sku: "MUG-01", qty: 2, priceCents: 1250 }],
 *     shippingCents: 499,
 *     totalCents: 2999,
 *   }
 *
 * Rules:
 *   - Independent copies: the returned order never shares an object or array with DEFAULTS,
 *     with an earlier or later build, or with the overrides argument. A test that pushes into
 *     order.lines or edits order.customer changes only its own order.
 *   - The overrides argument is never modified.
 *   - Top-level keys in overrides replace the default value.
 *   - customer is merged key by key: anOrder({ customer: { country: "VN" } }) keeps the default
 *     name and email and only changes the country.
 *   - Arrays are replaced, never merged: anOrder({ lines: [oneLine] }) has exactly one line.
 *   - id: "ORD-<n>" from a counter that starts at 1 and goes up by 1 for every generated id.
 *     If overrides has an id, that id is used and the counter does not move.
 *     resetIds() sets the counter back so the next generated id is "ORD-1".
 *   - totalCents is computed from the FINAL lines and shippingCents
 *     (sum of qty * priceCents, plus shippingCents), unless overrides has its own totalCents
 *     (a test that wants an inconsistent order says so explicitly).
 *
 * Example:
 *   resetIds();
 *   anOrder({ status: "paid", customer: { country: "VN" } })
 *   // { id: "ORD-1", status: "paid", customer: { name: "Lan Tran", email: "lan@example.com",
 *   //   country: "VN" }, lines: [{ sku: "MUG-01", qty: 2, priceCents: 1250 }], totalCents: 2999, ... }
 *
 * BUG: since the team switched to this builder, the order suite passes file by file but fails when
 * tests run in a different order, a customer override loses the customer's name, and ids keep
 * counting up across tests even though every test calls resetIds(). Fix the builder.
 */
function anOrder(overrides = {}) {
  const order = { ...DEFAULTS, ...overrides };
  order.id = overrides.id ?? `ORD-${nextId++}`;
  if (overrides.totalCents === undefined) order.totalCents = totalOf(order);
  return order;
}

let nextId = 1;

function resetIds() {
  let nextId = 1;
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
