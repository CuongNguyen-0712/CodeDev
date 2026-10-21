// Wrong variant: exact values, but only for "typical" carts - no boundary, no 0%, no invalid input.
function discountSuite(applyDiscount, assert) {
  assert.strictEqual(applyDiscount(8000, 10), 7200);
  assert.strictEqual(applyDiscount(12000, 20), 9600);
  assert.strictEqual(applyDiscount(3000, 10), 3000);
}
