/**
 * Audits log entries in chunks so the page stays responsive while it runs.
 *
 * Contract:
 *   - Process the entries in chunks of `chunkSize` (the last chunk may be smaller).
 *   - After each chunk, call onProgress(processed, total) so the progress bar can be painted.
 *   - Between two chunks, give the main thread back: await yieldToMain(), which resolves in a
 *     LATER TASK, so input events and rendering run in the gap.
 *   - Yield between chunks only: once the last chunk is done, resolve right away.
 *   - Resolve with { total, errors, warnings, slowestMs }.
 *
 * BUG: the compliance team says the tab still freezes for the whole audit, the "Cancel" button
 * reacts only when everything is finished, and for most files the progress bar stops just short
 * of 100%. The tallying itself is correct - fix the chunking.
 *
 * @param {{ level: "info" | "warn" | "error", durationMs: number }[]} entries
 * @param {{
 *   chunkSize: number,
 *   yieldToMain: () => Promise<void>,
 *   onProgress: (processed: number, total: number) => void,
 * }} options
 * @returns {Promise<{ total: number, errors: number, warnings: number, slowestMs: number }>}
 */
async function auditLogs(entries, { chunkSize, yieldToMain, onProgress }) {
  const summary = { total: entries.length, errors: 0, warnings: 0, slowestMs: 0 };

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
    if (end < entries.length) await yieldToMain();
  }
  // @end

  return summary;
}
