/**
 * Reference solution (never shipped to learners).
 */
function shippingFeeSuite(shippingFee, assert) {
  // Free-shipping line, both sides (#1; 9999 also kills #2 and #7).
  assert.strictEqual(shippingFee(9999, 1000, false), 499);
  assert.strictEqual(shippingFee(10000, 1000, false), 0);
  assert.strictEqual(shippingFee(0, 1000, false), 499);

  // Weight cap for free shipping, both sides (#3; 20001 g also kills #2).
  assert.strictEqual(shippingFee(10000, 20000, false), 0);
  assert.strictEqual(shippingFee(10000, 20001, false), 3349);

  // Weight surcharge: every started 1000 g above 2000 g (#4, #5).
  assert.strictEqual(shippingFee(3000, 2000, false), 499);
  assert.strictEqual(shippingFee(3000, 2001, false), 649);
  assert.strictEqual(shippingFee(3000, 3000, false), 649);
  assert.strictEqual(shippingFee(3000, 3001, false), 799);

  // Member discount only above the base fee (#6).
  assert.strictEqual(shippingFee(3000, 3001, true), 699);
  assert.strictEqual(shippingFee(3000, 1000, true), 499);

  // Invalid input, just outside each range (the hidden mutant: weight 0).
  assert.throws(() => shippingFee(-1, 1000, false), RangeError);
  assert.throws(() => shippingFee(99.5, 1000, false), RangeError);
  assert.throws(() => shippingFee(3000, 0, false), RangeError);
  assert.throws(() => shippingFee(3000, -1, false), RangeError);
  assert.throws(() => shippingFee(3000, 1.5, false), RangeError);
}
