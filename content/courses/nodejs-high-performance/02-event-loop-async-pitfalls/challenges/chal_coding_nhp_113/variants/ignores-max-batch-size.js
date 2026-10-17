// Wrong variant: coalesces and dedupes correctly, but sends every key in one call regardless of maxBatchSize.
function createBatchLoader(batchFn, options = {}) {
  let pending = null;

  return {
    load(key) {
      if (!pending) {
        const entries = (pending = new Map());
        queueMicrotask(async () => {
          pending = null;
          const keys = [...entries.keys()];
          try {
            const values = await batchFn(keys);
            keys.forEach((k, i) => (values[i] instanceof Error ? entries.get(k).reject(values[i]) : entries.get(k).resolve(values[i])));
          } catch (error) {
            keys.forEach((k) => entries.get(k).reject(error));
          }
        });
      }
      if (!pending.has(key)) {
        const entry = {};
        entry.promise = new Promise((resolve, reject) => Object.assign(entry, { resolve, reject }));
        pending.set(key, entry);
      }
      return pending.get(key).promise;
    },
  };
}
