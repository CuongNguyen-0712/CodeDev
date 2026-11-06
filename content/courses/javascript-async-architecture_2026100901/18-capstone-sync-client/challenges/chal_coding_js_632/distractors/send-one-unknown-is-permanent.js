// @piece send-one: Send the mutation and sort out its outcome
new Promise((res) => res(send({ id: entry.id, recordId: entry.recordId, patch: { ...entry.patch } })))
  .then(
    () => {
      remove(entry);
      summary.sent.push(entry.id);
    },
    (error) => {
      if (!error || error.retryable !== true) {
        remove(entry);
        summary.failed.push({ id: entry.id, error: error && error.message });
      } else {
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
