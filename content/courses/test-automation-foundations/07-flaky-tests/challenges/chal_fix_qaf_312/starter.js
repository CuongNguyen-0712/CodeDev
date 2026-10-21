/**
 * The coupon suite is flaky. Fix the TESTS - the code under test is correct.
 *
 * couponSuite(t, deps) registers tests, like a node:test file:
 *   t.test(name, fn)    registers one test (fn may be async)
 *   t.beforeEach(fn)    registers a hook that runs before every test
 *
 * deps:
 *   isCouponValid(coupon, cart) -> boolean   the function under test (see the rule below)
 *   createCart()                             a new, empty cart: cart.add(priceCents, qty = 1), cart.totalCents()
 *   clock.now()                              the time isCouponValid uses, in ms since 1970 (UTC)
 *   clock.set(time)                          pins that time; time is an ISO string ("2026-11-27T23:59:59.999Z") or ms
 *   assert.strictEqual(actual, expected, message?), assert.ok(value, message?)
 *
 * Until a test calls clock.set, clock.now() returns the REAL wall-clock time of the run, which is
 * different on every run (like Date.now()). The clock goes back to wall time before every test
 * (before the beforeEach hooks run), just as t.mock.timers is restored after each node:test test.
 *
 * The rule (already implemented correctly):
 *   coupon = { code, minTotalCents, expiresAt }, expiresAt = the LAST second of validity, in UTC,
 *   stored to the second, e.g. "2026-11-27T23:59:59Z".
 *   isCouponValid is true when cart.totalCents() >= coupon.minTotalCents
 *   AND clock.now() < Date.parse(expiresAt) + 1000 (valid through the whole last second,
 *   expired from the first millisecond after it).
 *
 * The grader calls couponSuite again for every run and runs the tests:
 *   - in the written order, in reverse, and in several seeded shuffled orders;
 *   - each test alone;
 *   - with the wall clock at several times: a normal workday, 00:30 in Vietnam (17:30 UTC),
 *     the last millisecond of a month and the first millisecond of the next one.
 * Every run must pass. Then it runs your suite against buggy versions of isCouponValid (for
 * example one that rejects the coupon during its last second, one that ignores the minimum
 * total) and your suite must FAIL in every run. Deleting the flaky tests does not work: keep a
 * test for each rule, including both sides of each boundary (exactly the minimum and one cent
 * below; the last millisecond of the expiry second and the first millisecond after it).
 * Every test must make at least one assertion.
 *
 * Example of a stable test:
 *   t.test("a coupon far in the future is valid", () => {
 *     const cart = createCart();
 *     cart.add(1500, 2);
 *     clock.set("2026-01-01T00:00:00.000Z");
 *     assert.strictEqual(isCouponValid({ code: "X", minTotalCents: 0, expiresAt: "2030-01-01T00:00:00Z" }, cart), true);
 *   });
 */
function couponSuite(t, { isCouponValid, createCart, clock, assert }) {
  const cart = createCart(); // one cart, shared by every test below
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
    // expiries are stored to the second, so drop the milliseconds
    const expiresAt = new Date(clock.now() + 500).toISOString().slice(0, 19) + "Z";
    assert.strictEqual(isCouponValid({ ...blackFriday, minTotalCents: 0, expiresAt }, cart), true);
  });

  t.test("a coupon is expired after its last second", () => {
    const expiresAt = new Date(clock.now() - 1000).toISOString().slice(0, 19) + "Z";
    assert.strictEqual(isCouponValid({ ...blackFriday, minTotalCents: 0, expiresAt }, cart), false);
  });
}
