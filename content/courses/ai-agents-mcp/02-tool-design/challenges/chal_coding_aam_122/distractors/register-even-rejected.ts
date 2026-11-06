// @piece property-checks: Each parameter, the required list, then register
for (const [p, s] of Object.entries(spec.parameters.properties)) {
    if (typeof s.description !== "string" || s.description.trim() === "") errors.push(`parameter "${p}" needs a description`);
    if (!TYPES.includes(s.type)) errors.push(`parameter "${p}" has unsupported type "${s.type}"`);
    if (s.minimum !== undefined && s.maximum !== undefined && s.minimum > s.maximum) {
        errors.push(`parameter "${p}" has minimum greater than maximum`);
    }
    if (s.minLength !== undefined && s.maxLength !== undefined && s.minLength > s.maxLength) {
        errors.push(`parameter "${p}" has minLength greater than maxLength`);
    }
    if (s.pattern !== undefined && !compiles(s.pattern)) errors.push(`parameter "${p}" has an invalid pattern`);
}
for (const r of spec.parameters.required) {
    if (!Object.hasOwn(spec.parameters.properties, r)) errors.push(`required "${r}" is not a declared parameter`);
}
if (!registry.has(spec.name)) registry.set(spec.name, spec);
