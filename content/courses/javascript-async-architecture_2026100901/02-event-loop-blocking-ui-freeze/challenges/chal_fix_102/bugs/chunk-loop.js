// @piece chunk-loop: Go through the entries chunk by chunk
for (let i = 0; i < entries.length; i++) {
  const entry = entries[i];
  if (entry.level === "error") summary.errors++;
  else if (entry.level === "warn") summary.warnings++;
  if (entry.durationMs > summary.slowestMs) summary.slowestMs = entry.durationMs;

  if ((i + 1) % chunkSize === 0) {
    onProgress(i + 1, entries.length);
    // Let the browser paint the progress bar and handle clicks.
    await Promise.resolve();
  }
}
