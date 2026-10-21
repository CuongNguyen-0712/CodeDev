// Wrong variant: sorts only the top-level keys; nested objects keep their insertion order.
function normalizeForSnapshot(value) {
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = new Map();

  function walk(v, depth) {
    if (Array.isArray(v)) return v.map((item) => walk(item, depth + 1));
    if (v !== null && typeof v === "object") {
      const keys = depth === 0 ? Object.keys(v).sort() : Object.keys(v);
      const out = {};
      for (const key of keys) out[key] = walk(v[key], depth + 1);
      return out;
    }
    if (typeof v === "string") {
      if (TIMESTAMP.test(v)) return "<timestamp>";
      if (UUID.test(v)) {
        if (!ids.has(v)) ids.set(v, `<id-${ids.size + 1}>`);
        return ids.get(v);
      }
    }
    return v;
  }

  return walk(value, 0);
}
