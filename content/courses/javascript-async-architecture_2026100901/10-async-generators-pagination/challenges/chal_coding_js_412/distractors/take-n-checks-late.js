// @piece take-n: Yield n values, then stop pulling
let count = 0;
for await (const item of source) {
  if (count >= n) return;
  yield item;
  count += 1;
}
