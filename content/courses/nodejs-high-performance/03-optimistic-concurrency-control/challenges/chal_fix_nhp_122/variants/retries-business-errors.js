// Wrong variant: fresh reads and a bound, but every error is treated as a conflict and retried.
async function updateWithRetry(store, id, mutate, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const current = await store.get(id);
      const next = mutate(current.data);
      if (await store.compareAndSet(id, current.version, next)) {
        return { id, version: current.version + 1, data: next };
      }
    } catch (error) {
      // swallow and try again
    }
  }
  throw new Error("CONFLICT");
}
