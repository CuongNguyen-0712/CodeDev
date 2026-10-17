/**
 * Reference solution (never shipped to learners).
 * The first load() of a batch creates a Map (key -> deferred promise) and schedules a
 * flush with queueMicrotask, so every load in the same synchronous run joins it.
 * The flush splits the unique keys into chunks and maps each result back by position.
 */
function createBatchLoader(batchFn, options = {}) {
  const maxBatchSize = options.maxBatchSize > 0 ? options.maxBatchSize : Infinity;
  let pending = null;

  async function dispatch(keys, entries) {
    let values;
    try {
      values = await batchFn(keys);
      if (!Array.isArray(values) || values.length !== keys.length) {
        throw new Error(`batchFn must resolve to an array of ${keys.length} values`);
      }
    } catch (error) {
      for (const key of keys) entries.get(key).reject(error);
      return;
    }
    keys.forEach((key, i) => {
      const entry = entries.get(key);
      if (values[i] instanceof Error) entry.reject(values[i]);
      else entry.resolve(values[i]);
    });
  }

  function flush(entries) {
    const keys = [...entries.keys()];
    for (let start = 0; start < keys.length; start += maxBatchSize) {
      dispatch(keys.slice(start, start + maxBatchSize), entries);
    }
  }

  return {
    load(key) {
      if (!pending) {
        const entries = new Map();
        pending = entries;
        queueMicrotask(() => {
          pending = null;
          flush(entries);
        });
      }

      let entry = pending.get(key);
      if (!entry) {
        entry = {};
        entry.promise = new Promise((resolve, reject) => {
          entry.resolve = resolve;
          entry.reject = reject;
        });
        pending.set(key, entry);
      }
      return entry.promise;
    },
  };
}
