// @piece value-checks: Check the value against its parameter spec
const value = parsed[name];
if (spec.type === "integer") {
    if (typeof value !== "number") return `argument "${name}" must be integer`;
    if ((spec.minimum !== undefined && value < spec.minimum) || (spec.maximum !== undefined && value > spec.maximum)) {
        return `argument "${name}" is out of range`;
    }
    args[name] = value;
} else if (spec.type === "string") {
    if (typeof value !== "string") return `argument "${name}" must be string`;
    if (spec.maxLength !== undefined && value.length > spec.maxLength) return `argument "${name}" is too long`;
    if (spec.enum !== undefined && !spec.enum.includes(value)) return `argument "${name}" is not an allowed value`;
    args[name] = value;
} else {
    if (typeof value !== "boolean") return `argument "${name}" must be boolean`;
    args[name] = value;
}
