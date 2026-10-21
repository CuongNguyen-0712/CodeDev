// Wrong variant: covers the threshold and 0%, but only tests invalid input above the range.
function discountSuite(applyDiscount, assert) {
  assert.strictEqual(applyDiscount(8000, 10), 7200);
  assert.strictEqual(applyDiscount(4999, 10), 4999);
  assert.strictEqual(applyDiscount(5000, 10), 4500);
  assert.strictEqual(applyDiscount(8000, 0), 8000);
  assert.throws(() => applyDiscount(8000, 101), RangeError);
}
