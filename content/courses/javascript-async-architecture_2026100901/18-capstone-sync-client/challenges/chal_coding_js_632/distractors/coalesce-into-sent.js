// @piece coalesce: Merge into the record's newest unsent entry, or append
for (let i = outbox.length - 1; i >= 0; i--) {
  const entry = outbox[i];
  if (entry.recordId !== recordId) continue;
  if (!entry.inFlight) {
    entry.patch = { ...entry.patch, ...patch };
    return;
  }
  break;
}
outbox.push({ id, recordId, patch: { ...patch }, attempted: false, inFlight: false });
