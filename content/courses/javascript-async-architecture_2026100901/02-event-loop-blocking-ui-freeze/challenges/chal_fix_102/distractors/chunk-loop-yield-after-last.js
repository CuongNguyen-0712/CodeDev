// @piece chunk-loop: Go through the entries chunk by chunk
for (let start = 0; start < entries.length; start += chunkSize) {
  const end = Math.min(start + chunkSize, entries.length);
  for (let i = start; i < end; i++) {
    const entry = entries[i];
    if (entry.level === "error") summary.errors++;
    else if (entry.level === "warn") summary.warnings++;
    if (entry.durationMs > summary.slowestMs) summary.slowestMs = entry.durationMs;
  }

  onProgress(end, entries.length);
  await yieldToMain();
}
