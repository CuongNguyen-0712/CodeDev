// Wrong variant: every test pins the clock to a fixed instant, but the cart is still created once
// and shared - "rejects one cent below" fails whenever it runs after a test that added items, and
// "accepts exactly 20000" passes for the wrong reason (the cart holds 39999).
function couponSuite(t, { isCouponValid, createCart, clock, assert }) {
  const cart = createCart();
  t.beforeEach(() => {
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

  t.test("FLASH is valid in the last millisecond before midnight shop time (UTC+7)", () => {
    clock.set("2026-11-20T16:59:59.999Z");
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
