// Wrong variant: batches per tick but sends duplicate keys to batchFn.
function createBatchLoader(batchFn, options = {}) {
  const max = options.maxBatchSize > 0 ? options.maxBatchSize : Infinity;
  let queue = null;

  return {
    load(key) {
      return new Promise((resolve, reject) => {
        if (!queue) {
          const q = (queue = []);
          queueMicrotask(async () => {
            queue = null;
            for (let s = 0; s < q.length; s += max) {
              const chunk = q.slice(s, s + max);
              batchFn(chunk.map((e) => e.key)).then(
                (values) => chunk.forEach((e, i) => (values[i] instanceof Error ? e.reject(values[i]) : e.resolve(values[i]))),
                (error) => chunk.forEach((e) => e.reject(error))
              );
            }
          });
        }
        queue.push({ key, resolve, reject });
      });
    },
  };
}
