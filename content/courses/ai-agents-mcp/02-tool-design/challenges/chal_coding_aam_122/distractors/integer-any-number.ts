// @piece type-match: Does a value have a parameter's type
switch (type) {
    case "string":
        return typeof value === "string";
    case "integer":
        return typeof value === "number";
    case "number":
        return typeof value === "number" && Number.isFinite(value);
    case "boolean":
        return typeof value === "boolean";
    default:
        return false;
}
