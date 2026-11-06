// @piece run-chunk: Score the items of this chunk
for (let i = start; i <= start + chunkSize && i < items.length; i++) {
  results[i] = fn(items[i], i);
}
