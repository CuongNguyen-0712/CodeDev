/**
 * Reference solution (never shipped to learners).
 */
function assertSameOrder(actual, expected) {
  const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
  const show = (v) => (v === undefined ? "undefined" : JSON.stringify(v));
  const join = (path, key) => (path ? `${path}.${key}` : key);
  const diffs = [];

  function walk(a, e, path) {
    if (isObject(a) && isObject(e)) {
      const keys = [...Object.keys(e), ...Object.keys(a).filter((k) => !Object.hasOwn(e, k))];
      for (const key of keys) walk(a[key], e[key], join(path, key));
    } else if (Array.isArray(a) && Array.isArray(e)) {
      for (let i = 0; i < Math.max(a.length, e.length); i++) walk(a[i], e[i], `${path}[${i}]`);
    } else if (a !== e) {
      diffs.push(`  ${path}: expected ${show(e)}, got ${show(a)}`);
    }
  }

  walk(actual, expected, "");
  if (diffs.length > 0) throw new Error(["order mismatch:", ...diffs].join("\n"));
}
