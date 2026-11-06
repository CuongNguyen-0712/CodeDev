// @piece clean-value: Make one value safe to log
const clean = (value: unknown): unknown => {
    if (typeof value === "string") return value.length > max ? `${value.slice(0, max)}...[truncated]` : value;
    if (value instanceof Error) {
        const out: Fields = { name: clean(value.name), message: clean(value.message) };
        const frame = (value.stack ?? "").split("\n").map((line) => line.trim()).find((line) => line.startsWith("at "));
        if (frame !== undefined) out.stack = clean(frame);
        return out;
    }
    if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : clean(item)));
    if (value !== null && typeof value === "object") return value;
    return value;
};
