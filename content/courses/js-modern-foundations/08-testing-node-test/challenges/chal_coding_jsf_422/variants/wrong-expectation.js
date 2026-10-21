// Wrong variant: thorough, but the threshold expectation is wrong (assumes exactly 5000 gets
// no discount), so the suite fails against the correct implementation too.
function discountSuite(applyDiscount, assert) {
  assert.strictEqual(applyDiscount(8000, 10), 7200);
  assert.strictEqual(applyDiscount(5000, 10), 5000);
  assert.strictEqual(applyDiscount(8000, 0), 8000);
  assert.throws(() => applyDiscount(8000, 101), RangeError);
  assert.throws(() => applyDiscount(8000, -1), RangeError);
}
