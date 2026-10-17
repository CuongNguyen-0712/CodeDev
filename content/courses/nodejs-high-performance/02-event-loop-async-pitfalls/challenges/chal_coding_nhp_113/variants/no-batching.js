// Wrong variant: one batchFn call per load - correct values, but still N+1 round trips.
function createBatchLoader(batchFn, options = {}) {
  return {
    async load(key) {
      const [value] = await batchFn([key]);
      if (value instanceof Error) throw value;
      return value;
    },
  };
}
