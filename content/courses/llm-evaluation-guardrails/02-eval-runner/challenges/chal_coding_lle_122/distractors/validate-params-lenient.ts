// @piece validate-params: Check each assertion type's parameters
switch (a.type) {
    case "is_json":
        return null;
    case "json_schema":
        return validSchema(a.schema) ? null : "bad_definition";
    case "contains":
    case "not_contains":
        return typeof a.value === "string" && (a.ignoreCase === undefined || typeof a.ignoreCase === "boolean")
            ? null : "bad_definition";
    case "regex": {
        if (typeof a.pattern !== "string" || a.pattern === "") return "bad_definition";
        const flags = a.flags === undefined ? "" : a.flags;
        if (typeof flags !== "string" || !/^[ims]*$/.test(flags) || new Set(flags).size !== flags.length) return "bad_definition";
        return null;
    }
    case "max_length":
        return Number.isInteger(a.value) && (a.value as number) >= 0 ? null : "bad_definition";
    case "equals_field":
        return validPath(a.path) && "value" in a ? null : "bad_definition";
    case "score_in_range":
        return validPath(a.path) && isFiniteNumber(a.min) && isFiniteNumber(a.max) && a.min <= a.max ? null : "bad_definition";
}
