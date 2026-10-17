/**
 * Reference solution (never shipped to learners).
 * The Map holds the in-flight promise per key; it is removed as soon as that promise
 * settles, and only if it is still the current entry for the key.
 */
function singleFlight(fn) {
  const inFlight = new Map();

  return function load(key) {
    const existing = inFlight.get(key);
    if (existing) return existing;

    const promise = Promise.resolve()
      .then(() => fn(key))
      .finally(() => {
        if (inFlight.get(key) === promise) inFlight.delete(key);
      });

    inFlight.set(key, promise);
    return promise;
  };
}
