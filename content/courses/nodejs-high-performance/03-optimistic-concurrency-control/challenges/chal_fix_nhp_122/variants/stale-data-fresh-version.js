// Wrong variant: refreshes only the version, but keeps writing data computed from the first read -> lost updates.
async function updateWithRetry(store, id, mutate, maxAttempts = 3) {
  const first = await store.get(id);
  if (!first) throw new Error("NOT_FOUND");
  const next = mutate(first.data);

  let version = first.version;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (await store.compareAndSet(id, version, next)) {
      return { id, version: version + 1, data: next };
    }
    version = (await store.get(id)).version;
  }
  throw new Error("CONFLICT");
}
