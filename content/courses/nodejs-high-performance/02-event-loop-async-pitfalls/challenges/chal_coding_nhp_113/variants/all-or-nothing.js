// Wrong variant: batches and dedupes, but one missing key rejects every caller in the batch.
function createBatchLoader(batchFn, options = {}) {
  const max = options.maxBatchSize > 0 ? options.maxBatchSize : Infinity;
  let pending = null;

  return {
    load(key) {
      if (!pending) {
        const entries = (pending = new Map());
        queueMicrotask(() => {
          pending = null;
          const keys = [...entries.keys()];
          for (let s = 0; s < keys.length; s += max) {
            const chunk = keys.slice(s, s + max);
            batchFn(chunk).then((values) => {
              const failure = values.find((v) => v instanceof Error);
              chunk.forEach((k, i) => (failure ? entries.get(k).reject(failure) : entries.get(k).resolve(values[i])));
            }, (error) => chunk.forEach((k) => entries.get(k).reject(error)));
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
