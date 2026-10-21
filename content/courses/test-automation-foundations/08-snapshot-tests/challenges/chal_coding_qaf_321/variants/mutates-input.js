// Wrong variant: writes the placeholders into the input object while copying it, so the caller's invoice is changed.
function normalizeForSnapshot(value) {
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = new Map();

  function walk(v) {
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) v[i] = walk(v[i]);
      return [...v];
    }
    if (v !== null && typeof v === "object") {
      const out = {};
      for (const key of Object.keys(v).sort()) {
        v[key] = walk(v[key]);
        out[key] = v[key];
      }
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

  return walk(value);
}
