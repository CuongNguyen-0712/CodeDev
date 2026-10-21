// Wrong variant: calls shippingFee with the right edge inputs, but checks most of them with
// assert.ok / typeof instead of an exact fee, so several mutants still survive.
function shippingFeeSuite(shippingFee, assert) {
  assert.strictEqual(shippingFee(3000, 1000, false), 499);
  assert.ok(shippingFee(10000, 1000, false) >= 0);
  assert.ok(shippingFee(10000, 20000, false) >= 0);
  assert.ok(shippingFee(10000, 20001, false) > 0);
  assert.strictEqual(typeof shippingFee(3000, 2001, false), "number");
  assert.ok(shippingFee(3000, 3001, true) > 0);
  assert.throws(() => shippingFee(-1, 1000, false), RangeError);
  assert.throws(() => shippingFee(3000, 0, false), RangeError);
}
