// Wrong variant: gives every uuid occurrence a new number, so the same id gets different placeholders and relationships are lost.
function normalizeForSnapshot(value) {
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let next = 1;

  function walk(v) {
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === "object") {
      const out = {};
      for (const key of Object.keys(v).sort()) out[key] = walk(v[key]);
      return out;
    }
    if (typeof v === "string") {
      if (TIMESTAMP.test(v)) return "<timestamp>";
      if (UUID.test(v)) return `<id-${next++}>`;
    }
    return v;
  }

  return walk(value);
}
