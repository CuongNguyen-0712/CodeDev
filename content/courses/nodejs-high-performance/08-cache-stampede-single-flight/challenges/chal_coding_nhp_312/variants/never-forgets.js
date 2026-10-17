// Wrong variant: the promise is memoized forever -> the first value (or error) is served for the life of the process.
function singleFlight(fn) {
  const promises = new Map();
  return function load(key) {
    if (!promises.has(key)) promises.set(key, fn(key));
    return promises.get(key);
  };
}
