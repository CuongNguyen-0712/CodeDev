/**
 * Stable coupon suite: a fresh cart and a pinned clock for every test, fixed instants at both
 * sides of each boundary, and no test that depends on another one.
 */
function couponSuite(t, { isCouponValid, createCart, clock, assert }) {
  let cart;
  t.beforeEach(() => {
    cart = createCart(); // fresh state: no test sees another test's items
    clock.set("2026-11-20T10:00:00.000Z"); // a known, ordinary moment unless a test says otherwise
  });

  const blackFriday = { code: "BLACKFRIDAY", minTotalCents: 20000, expiresAt: "2026-11-27T23:59:59Z" };

  t.test("BLACKFRIDAY rejects a cart one cent below 20000", () => {
    cart.add(19999);
    assert.strictEqual(isCouponValid(blackFriday, cart), false);
  });

  t.test("BLACKFRIDAY accepts a cart of exactly 20000", () => {
    cart.add(20000);
    assert.strictEqual(isCouponValid(blackFriday, cart), true);
  });

  t.test("FLASH is valid in the last millisecond before midnight shop time (UTC+7)", () => {
    clock.set("2026-11-20T16:59:59.999Z"); // 23:59:59.999 in Vietnam
    const flash = { code: "FLASH", minTotalCents: 0, expiresAt: "2026-11-20T23:59:59+07:00" };
    assert.strictEqual(isCouponValid(flash, cart), true);
  });

  t.test("BLACKFRIDAY is valid in the last millisecond of its last second", () => {
    cart.add(20000);
    clock.set("2026-11-27T23:59:59.999Z");
    assert.strictEqual(isCouponValid(blackFriday, cart), true);
  });

  t.test("BLACKFRIDAY is expired from the first millisecond after its last second", () => {
    cart.add(20000);
    clock.set("2026-11-28T00:00:00.000Z");
    assert.strictEqual(isCouponValid(blackFriday, cart), false);
  });
}
