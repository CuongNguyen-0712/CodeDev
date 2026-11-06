// @piece canonical: One JSON text per value, whatever the key order
if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}
return JSON.stringify(value) ?? "null"; // undefined (no args) -> null
