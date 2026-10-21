// Wrong variant: a fresh cart in beforeEach fixes the order dependency, but the tests still build
// their times from the real clock - FLASH fails at night in Vietnam and the boundary tests only
// catch the off-by-one-second bugs on some runs.
function couponSuite(t, { isCouponValid, createCart, clock, assert }) {
  let cart;
  t.beforeEach(() => {
    cart = createCart();
  });
  const todayUTC = () => new Date(clock.now()).toISOString().slice(0, 10);
  const blackFriday = { code: "BLACKFRIDAY", minTotalCents: 20000, expiresAt: "2026-11-27T23:59:59Z" };

  t.test("BLACKFRIDAY rejects a cart one cent below 20000", () => {
    cart.add(19999);
    const forever = { ...blackFriday, expiresAt: "2099-12-31T23:59:59Z" };
    assert.strictEqual(isCouponValid(forever, cart), false);
  });

  t.test("BLACKFRIDAY accepts a cart of exactly 20000", () => {
    cart.add(20000);
    const forever = { ...blackFriday, expiresAt: "2099-12-31T23:59:59Z" };
    assert.strictEqual(isCouponValid(forever, cart), true);
  });

  t.test("FLASH is valid until midnight shop time (UTC+7)", () => {
    const flash = { code: "FLASH", minTotalCents: 0, expiresAt: `${todayUTC()}T23:59:59+07:00` };
    assert.strictEqual(isCouponValid(flash, cart), true);
  });

  t.test("a coupon is still valid during its last second", () => {
    const expiresAt = new Date(clock.now() + 500).toISOString().slice(0, 19) + "Z";
    assert.strictEqual(isCouponValid({ ...blackFriday, minTotalCents: 0, expiresAt }, cart), true);
  });

  t.test("a coupon is expired after its last second", () => {
    const expiresAt = new Date(clock.now() - 1000).toISOString().slice(0, 19) + "Z";
    assert.strictEqual(isCouponValid({ ...blackFriday, minTotalCents: 0, expiresAt }, cart), false);
  });
}
