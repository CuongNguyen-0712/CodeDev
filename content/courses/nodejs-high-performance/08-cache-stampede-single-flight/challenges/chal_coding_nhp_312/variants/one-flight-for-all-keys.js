// Wrong variant: a single shared in-flight promise ignores the key -> callers for "b" receive the value loaded for "a".
function singleFlight(fn) {
  let current = null;
  return function load(key) {
    if (current) return current;
    current = fn(key).finally(() => { current = null; });
    return current;
  };
}
