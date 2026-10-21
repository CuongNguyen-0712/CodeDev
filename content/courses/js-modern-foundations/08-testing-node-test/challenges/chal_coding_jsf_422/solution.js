/**
 * Reference solution (never shipped to learners).
 */
function discountSuite(applyDiscount, assert) {
  // Happy path: an exact value, not just "something truthy".
  assert.strictEqual(applyDiscount(8000, 10), 7200);
  assert.strictEqual(applyDiscount(8000, 25), 6000);

  // Both sides of the threshold.
  assert.strictEqual(applyDiscount(4999, 10), 4999);
  assert.strictEqual(applyDiscount(5000, 10), 4500);

  // Edges of the percent range and the default.
  assert.strictEqual(applyDiscount(8000, 0), 8000);
  assert.strictEqual(applyDiscount(8000, 100), 0);
  assert.strictEqual(applyDiscount(8000), 7200);
  assert.strictEqual(applyDiscount(0, 10), 0);

  // Invalid input, just outside the range on both ends.
  assert.throws(() => applyDiscount(8000, 101), RangeError);
  assert.throws(() => applyDiscount(8000, -1), RangeError);
  assert.throws(() => applyDiscount(-1, 10), RangeError);
  assert.throws(() => applyDiscount(8000, 12.5), RangeError);
}
