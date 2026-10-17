// Wrong variant: re-reads correctly but retries forever - a hot row turns into an infinite loop.
async function updateWithRetry(store, id, mutate, maxAttempts = 3) {
  for (;;) {
    const current = await store.get(id);
    if (!current) throw new Error("NOT_FOUND");
    const next = mutate(current.data);
    if (await store.compareAndSet(id, current.version, next)) {
      return { id, version: current.version + 1, data: next };
    }
  }
}
