// Wrong variant: chunks and progress are right, but it also yields after the last chunk,
// so the finished result waits behind whatever else is queued.
async function auditLogs(entries, { chunkSize, yieldToMain, onProgress }) {
  const summary = { total: entries.length, errors: 0, warnings: 0, slowestMs: 0 };
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
  return summary;
}
