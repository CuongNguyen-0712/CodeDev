// @piece enum-values: Compare the allowed values
if (a.enum && b.enum) {
    const key = (v: unknown) => JSON.stringify(v);
    const oldValues = new Set(a.enum.map(key));
    const newValues = new Set(b.enum.map(key));
    for (const v of newValues) if (!oldValues.has(v)) safe.push({ path, change: "enum-value-added", detail: v });
    for (const v of oldValues) if (!newValues.has(v)) safe.push({ path, change: "enum-value-removed", detail: v });
}
