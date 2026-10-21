// Wrong variant: kills every mutant in the report, but tests an invalid weight only with -1,
// so the hidden mutant (weightGrams <= 0 changed to < 0, weight 0 accepted) survives.
function shippingFeeSuite(shippingFee, assert) {
  assert.strictEqual(shippingFee(9999, 1000, false), 499);
  assert.strictEqual(shippingFee(10000, 1000, false), 0);
  assert.strictEqual(shippingFee(10000, 20000, false), 0);
  assert.strictEqual(shippingFee(10000, 20001, false), 3349);
  assert.strictEqual(shippingFee(3000, 2001, false), 649);
  assert.strictEqual(shippingFee(3000, 3001, false), 799);
  assert.strictEqual(shippingFee(3000, 3001, true), 699);
  assert.strictEqual(shippingFee(3000, 1000, true), 499);
  assert.throws(() => shippingFee(-1, 1000, false), RangeError);
  assert.throws(() => shippingFee(3000, -1, false), RangeError);
}
