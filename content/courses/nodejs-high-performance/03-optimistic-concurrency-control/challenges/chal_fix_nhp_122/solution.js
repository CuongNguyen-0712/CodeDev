/**
 * Reference solution (never shipped to learners).
 * A retry must start from a FRESH read: the conflict means the snapshot is stale, so
 * re-sending its version can never succeed, and re-applying mutate to stale data would
 * lose the other writer's change. The loop stays bounded by maxAttempts.
 */
async function updateWithRetry(store, id, mutate, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const current = await store.get(id);
    if (!current) throw new Error("NOT_FOUND");

    const next = mutate(current.data);
    const saved = await store.compareAndSet(id, current.version, next);
    if (saved) {
      return { id, version: current.version + 1, data: next };
    }
  }

  throw new Error("CONFLICT");
}
