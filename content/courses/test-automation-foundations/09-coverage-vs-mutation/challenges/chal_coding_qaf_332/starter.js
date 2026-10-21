/**
 * Read a mutation report and write the tests that kill every surviving mutant.
 *
 * The shop now prices shipping by weight. This is the code under test (line numbers matter -
 * the report below refers to them):
 *
 *   1  function shippingFee(subtotalCents, weightGrams, isMember) {
 *   2    if (!Number.isInteger(subtotalCents) || subtotalCents < 0) throw new RangeError("bad subtotal");
 *   3    if (!Number.isInteger(weightGrams) || weightGrams <= 0) throw new RangeError("bad weight");
 *   4    if (subtotalCents >= 10000 && weightGrams <= 20000) return 0;
 *   5    let fee = 499;
 *   6    if (weightGrams > 2000) fee = fee + 150 * Math.ceil((weightGrams - 2000) / 1000);
 *   7    if (isMember && fee > 499) fee = fee - 100;
 *   8    return fee;
 *   9  }
 *
 * The spec, in words:
 *   - subtotalCents must be a whole number >= 0 and weightGrams a whole number > 0,
 *     otherwise shippingFee throws a RangeError.
 *   - Orders of 10000 cents ($100.00) or more ship free (fee 0) - but only parcels of
 *     20000 g or less. Heavier parcels always pay.
 *   - Otherwise the fee is 499 cents for the first 2000 g, plus 150 cents for every started
 *     1000 g above 2000 g: 2000 g -> 499, 2001 g -> 649, 3000 g -> 649, 3001 g -> 799.
 *   - Members get 100 cents off, but only when the fee is above 499 (heavy parcels):
 *     shippingFee(3000, 3001, true) === 699, shippingFee(3000, 1000, true) === 499.
 *
 * The suite below reaches 100% line coverage of shippingFee (branch 92.86%) under
 * node --test --experimental-test-coverage. Last night's mutation run still reported:
 *
 *   #1  line 4  >= changed to >               (subtotalCents > 10000)          SURVIVED
 *   #2  line 4  && changed to ||              (... || weightGrams <= 20000)    SURVIVED
 *   #3  line 4  <= changed to <               (weightGrams < 20000)            SURVIVED
 *   #4  line 6  + changed to -                (fee = fee - 150 * ...)          SURVIVED
 *   #5  line 6  Math.ceil changed to Math.floor                                SURVIVED
 *   #6  line 7  && changed to ||              (isMember || fee > 499)          SURVIVED
 *   #7  line 8  return value replaced by 0    (return 0)                       SURVIVED
 *   #8  line 6  > changed to >=               (weightGrams >= 2000)            EQUIVALENT
 *
 * Mutant #8 is equivalent: at exactly 2000 g the surcharge is 150 * Math.ceil(0 / 1000) = 0,
 * so it returns the same fee as the original for every input. No test can kill it, and the
 * grader does not count it. Mutants this suite already kills are not listed.
 *
 * Your job: replace the weak checks with exact ones so that every listed mutant is killed
 * (your suite throws when it runs against that mutant) while the suite stays green against
 * the correct shippingFee. For each mutant, ask: "which input gives a different fee here,
 * and what is the right fee for it?" The grader also runs one more mutant that is NOT in
 * this report, so test every rule of the spec at its edges, not only the listed lines.
 *
 * The grader calls shippingFeeSuite(shippingFee, assert) once per implementation: the
 * correct one (must pass, with at least one assertion) and each mutant (must throw).
 * The assert object works like node:assert/strict:
 *   assert.ok(value, message?)                  throws unless value is truthy
 *   assert.strictEqual(actual, expected, msg?)  throws unless Object.is(actual, expected)
 *   assert.throws(fn, ErrorClass?, msg?)        throws unless fn() throws (an instance of ErrorClass, if given)
 *
 * @param {(subtotalCents: number, weightGrams: number, isMember?: boolean) => number} shippingFee
 * @param {{ ok: Function, strictEqual: Function, throws: Function }} assert
 */
function shippingFeeSuite(shippingFee, assert) {
  // 100% line coverage - and every mutant in the report survives it.
  assert.strictEqual(typeof shippingFee(12000, 1000, false), "number");
  assert.strictEqual(typeof shippingFee(3000, 3500, true), "number");
  assert.ok(shippingFee(3000, 500, false) >= 0);
  assert.throws(() => shippingFee(-1, 1000, false), RangeError);

  // TODO: add exact checks (assert.strictEqual with a literal fee, assert.throws) that kill the mutants
}
