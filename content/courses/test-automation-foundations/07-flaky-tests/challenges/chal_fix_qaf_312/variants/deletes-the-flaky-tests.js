// Wrong variant: "fixed" by deleting the time tests that were flaky. The rest is stable, but nothing
// checks the expiry any more - a coupon rejected during its last second (the incident's bug) passes.
function couponSuite(t, { isCouponValid, createCart, clock, assert }) {
  let cart;
  t.beforeEach(() => {
    cart = createCart();
    clock.set("2026-11-20T10:00:00.000Z");
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
}
