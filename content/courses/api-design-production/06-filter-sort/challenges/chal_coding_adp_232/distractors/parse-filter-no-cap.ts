// @piece parse-filter: Check one filter and add it to the plan
// Returns an error message, or null after adding the filter to the plan.
function parseFilter(name: string, value: string, plan: Plan): string | null {
    const [, field, explicitOp] = name.match(/^([a-z_]+)(?:\[([a-z]+)\])?$/)!;
    const rule = FILTERS[field];
    if (!rule) return `unknown filter "${field}"`;
    const raw = value.split(",");
    const op = explicitOp ?? (raw.length > 1 ? "in" : "eq");
    if (!rule.ops.includes(op)) return `operator "${op}" is not allowed on "${field}"`;
    if (op !== "in" && raw.length > 1) return `"${name}" takes one value`;
    if (raw.length > MAX_LIST * 1000) return `too many values for "${field}" (max ${MAX_LIST})`;
    const values: Value[] = [];
    for (const v of raw) {
        const coerced = coerce(rule, v);
        if (coerced === null) return `invalid value "${v}" for "${field}": expected ${rule.expected}`;
        values.push(coerced);
    }
    plan.filters.push({ field, op, value: op === "in" ? values : values[0] });
    return null;
}
