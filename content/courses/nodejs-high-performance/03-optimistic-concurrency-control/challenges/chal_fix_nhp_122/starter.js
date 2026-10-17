/**
 * Applies `mutate` to a versioned record with optimistic concurrency control:
 * read the record, compute the new data, and write it only if nobody changed the
 * record in between (compare-and-set on the version). On a conflict, try again -
 * at most `maxAttempts` writes in total - then give up with Error("CONFLICT").
 *
 * BUG: during the flash sale, many orders fail with CONFLICT although the product
 * still has plenty of stock. The logs show every retry of a failing order sending
 * the same expected version, and that version never succeeds.
 *
 * Errors thrown by `mutate` (business rules such as OUT_OF_STOCK) must propagate
 * unchanged - they are not conflicts and must not be retried.
 *
 * @param {{
 *   get(id: string): Promise<{ id: string, version: number, data: object } | null>,
 *   compareAndSet(id: string, expectedVersion: number, data: object): Promise<boolean>
 * }} store  compareAndSet writes `data` and bumps the version only if the current
 *           version equals expectedVersion; it returns false otherwise (0 rows updated)
 * @param {string} id
 * @param {(data: object) => object} mutate  pure function: current data -> new data
 * @param {number} [maxAttempts]
 * @returns {Promise<{ id: string, version: number, data: object }>}
 */
async function updateWithRetry(store, id, mutate, maxAttempts = 3) {
  const current = await store.get(id);
  if (!current) throw new Error("NOT_FOUND");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const next = mutate(current.data);
    const saved = await store.compareAndSet(id, current.version, next);
    if (saved) {
      return { id, version: current.version + 1, data: next };
    }
  }

  throw new Error("CONFLICT");
}
