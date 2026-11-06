// @piece pump: Start what may start now, or finish the flush
for (const entry of outbox) {
  if (inFlight >= maxInFlight) break;
  if (entry.inFlight || blocked.has(entry.recordId)) continue;
  start(entry);
}
if (inFlight === 0) {
  summary.pending = outbox.map((entry) => entry.id);
  running = null;
  resolve(summary);
}
