// @piece check-config: Check every variable and report the problems
const missing: string[] = [];
const invalid: string[] = [];
for (const spec of SCHEMA) {
    const value = config[spec.name];
    if (value === undefined) {
        if (spec.required) throw new Error(`Invalid configuration: missing ${spec.name}`);
        continue;
    }
    if (!spec.valid(value)) throw new Error(`Invalid configuration: invalid ${spec.name}`);
}
if (missing.length > 0 || invalid.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`missing ${missing.join(", ")}`);
    if (invalid.length > 0) parts.push(`invalid ${invalid.join(", ")}`);
    throw new Error(`Invalid configuration: ${parts.join("; ")}`);
}
