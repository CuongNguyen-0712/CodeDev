// @piece read-and-retry: Read the record and retry the write on a conflict
const current = await store.get(id);
if (!current) throw new Error("NOT_FOUND");

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const next = mutate(current.data);
  const saved = await store.compareAndSet(id, current.version, next);
  if (saved) {
    return { id, version: current.version + 1, data: next };
  }
}
