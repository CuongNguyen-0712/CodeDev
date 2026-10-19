// Wrong variant: progress is fixed, but it still "yields" with a microtask.
// Every chunk runs in the same task, so the keystrokes wait until the audit is over.
async function auditLogs(entries, { chunkSize, yieldToMain, onProgress }) {
  const summary = { total: entries.length, errors: 0, warnings: 0, slowestMs: 0 };
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.level === "error") summary.errors++;
    else if (entry.level === "warn") summary.warnings++;
    if (entry.durationMs > summary.slowestMs) summary.slowestMs = entry.durationMs;
    const last = i === entries.length - 1;
    if ((i + 1) % chunkSize === 0 || last) {
      onProgress(i + 1, entries.length);
      if (!last) await Promise.resolve();
    }
  }
  return summary;
}
