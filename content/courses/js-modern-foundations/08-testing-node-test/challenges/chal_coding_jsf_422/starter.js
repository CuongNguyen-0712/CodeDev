/**
 * Write a test suite that catches real bugs in applyDiscount.
 *
 * The grader calls discountSuite(applyDiscount, assert) several times: once with the correct
 * applyDiscount, and once with each of several buggy versions. Your suite "catches" a bug when
 * it throws (a failing assertion) against that version. It must NOT throw against the correct one.
 *
 * The function under test - applyDiscount(subtotalCents, percent = 10):
 *   - subtotalCents must be a whole number >= 0, otherwise it throws a RangeError.
 *   - percent must be a whole number from 0 to 100, otherwise it throws a RangeError.
 *     When percent is omitted (undefined) it defaults to 10.
 *   - Carts below 5000 cents ($50.00) get no discount: the subtotal is returned unchanged.
 *     A cart of exactly 5000 cents DOES get the discount.
 *   - Otherwise it returns the price after discount, in cents:
 *       subtotalCents - Math.round(subtotalCents * percent / 100)
 *     e.g. applyDiscount(8000, 25) === 6000
 *
 * The assert object you receive works like node:assert/strict:
 *   assert.ok(value, message?)                  throws unless value is truthy
 *   assert.strictEqual(actual, expected, msg?)  throws unless Object.is(actual, expected)
 *   assert.throws(fn, ErrorClass?, msg?)        throws unless fn() throws (an instance of ErrorClass, if given)
 *
 * Think like a tester: the happy path, both sides of the threshold, 0 and 100, values just
 * outside the allowed range on BOTH ends, and the default. Every check must compare against an
 * exact expected value - a suite that cannot fail catches nothing.
 *
 * @param {(subtotalCents: number, percent?: number) => number} applyDiscount
 * @param {{ ok: Function, strictEqual: Function, throws: Function }} assert
 */
function discountSuite(applyDiscount, assert) {
  // The test that shipped with the incident: it is green for every bug below.
  const result = applyDiscount(8000, 10);
  assert.ok(result);

  // TODO: replace the line above with exact checks (assert.strictEqual / assert.throws)
}
