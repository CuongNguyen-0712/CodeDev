// @piece read-and-retry: Read the record and retry the write on a conflict
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
