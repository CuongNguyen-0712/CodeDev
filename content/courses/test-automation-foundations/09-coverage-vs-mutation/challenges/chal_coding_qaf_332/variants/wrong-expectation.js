// Wrong variant: thorough, but misreads the member rule (expects 100 cents off a light parcel
// too), so the suite fails against the correct shippingFee.
function shippingFeeSuite(shippingFee, assert) {
  assert.strictEqual(shippingFee(9999, 1000, false), 499);
  assert.strictEqual(shippingFee(10000, 1000, false), 0);
  assert.strictEqual(shippingFee(10000, 20000, false), 0);
  assert.strictEqual(shippingFee(10000, 20001, false), 3349);
  assert.strictEqual(shippingFee(3000, 2001, false), 649);
  assert.strictEqual(shippingFee(3000, 3001, false), 799);
  assert.strictEqual(shippingFee(3000, 3001, true), 699);
  assert.strictEqual(shippingFee(3000, 1000, true), 399);
  assert.throws(() => shippingFee(3000, 0, false), RangeError);
}
