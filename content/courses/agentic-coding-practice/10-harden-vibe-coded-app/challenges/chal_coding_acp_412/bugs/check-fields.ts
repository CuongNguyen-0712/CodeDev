// @piece check-fields: Check every field of the body
const changes = body as Record<string, unknown>;
for (const [field, value] of Object.entries(changes)) {
    if (field === "title" && (typeof value !== "string" || value.trim() === "")) return invalid(field);
    if (field === "description" && typeof value !== "string") return invalid(field);
    if (field === "price" && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) return invalid(field);
}
