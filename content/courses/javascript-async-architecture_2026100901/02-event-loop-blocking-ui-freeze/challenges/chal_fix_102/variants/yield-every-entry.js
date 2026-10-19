// Wrong variant: yields after every single entry - responsive, but it ignores chunkSize and
// pays a task switch per entry (500,000 of them in production).
async function auditLogs(entries, { chunkSize, yieldToMain, onProgress }) {
  const summary = { total: entries.length, errors: 0, warnings: 0, slowestMs: 0 };
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.level === "error") summary.errors++;
    else if (entry.level === "warn") summary.warnings++;
    if (entry.durationMs > summary.slowestMs) summary.slowestMs = entry.durationMs;
    if ((i + 1) % chunkSize === 0 || i === entries.length - 1) onProgress(i + 1, entries.length);
    if (i < entries.length - 1) await yieldToMain();
  }
  return summary;
}
