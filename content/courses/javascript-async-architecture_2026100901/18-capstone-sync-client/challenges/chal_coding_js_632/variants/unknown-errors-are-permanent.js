// Wrong variant: only errors flagged retryable: true are kept; a TypeError from a dropped connection
// is reported as failed and the technician's edit is thrown away.
function createSyncClient({ send, maxInFlight = 4 }) {
  const outbox = [];
  let running = null;

  function enqueue({ id, recordId, patch }) {
    // Coalesce into the newest entry of this record - only if it was never sent.
    for (let i = outbox.length - 1; i >= 0; i--) {
      const entry = outbox[i];
      if (entry.recordId !== recordId) continue;
      if (!entry.inFlight && !entry.attempted) {
        entry.patch = { ...entry.patch, ...patch };
        return;
      }
      break;
    }
    outbox.push({ id, recordId, patch: { ...patch }, attempted: false, inFlight: false });
  }

  function flush() {
    if (running) return running;

    running = new Promise((resolve) => {
      const summary = { sent: [], failed: [], pending: [] };
      const busy = new Set();      // records with a mutation in flight
      const blocked = new Set();   // records that hit a transient error in this flush
      let inFlight = 0;

      const remove = (entry) => outbox.splice(outbox.indexOf(entry), 1);

      function start(entry) {
        entry.inFlight = true;
        entry.attempted = true;
        busy.add(entry.recordId);
        inFlight++;

        new Promise((res) => res(send({ id: entry.id, recordId: entry.recordId, patch: { ...entry.patch } })))
          .then(
            () => {
              remove(entry);
              summary.sent.push(entry.id);
            },
            (error) => {
              if (!error || error.retryable !== true) {
                remove(entry);
                summary.failed.push({ id: entry.id, error: error.message });
              } else {
                // retryable or unknown: keep it, and keep its record's order
                entry.inFlight = false;
                blocked.add(entry.recordId);
              }
            },
          )
          .then(() => {
            inFlight--;
            busy.delete(entry.recordId);
            pump();
          });
      }

      function pump() {
        for (const entry of outbox) {
          if (inFlight >= maxInFlight) break;
          if (entry.inFlight || busy.has(entry.recordId) || blocked.has(entry.recordId)) continue;
          start(entry);
        }
        if (inFlight === 0) {
          summary.pending = outbox.map((entry) => entry.id);
          running = null;
          resolve(summary);
        }
      }

      pump();
    });

    return running;
  }

  return { enqueue, flush };
}
