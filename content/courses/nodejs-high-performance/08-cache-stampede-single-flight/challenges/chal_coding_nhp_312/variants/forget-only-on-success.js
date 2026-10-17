// Wrong variant: the key is cleared only when the load succeeds -> one failure is replayed to every later caller.
function singleFlight(fn) {
  const inFlight = new Map();
  return function load(key) {
    if (inFlight.has(key)) return inFlight.get(key);
    const promise = fn(key).then((value) => {
      inFlight.delete(key);
      return value;
    });
    inFlight.set(key, promise);
    return promise;
  };
}
