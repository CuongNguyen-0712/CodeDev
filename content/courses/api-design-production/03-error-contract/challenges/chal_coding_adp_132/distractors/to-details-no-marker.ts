// @piece to-details: Clean, sort and cap the field errors
function toDetails(list: unknown[]): FieldError[] {
    const clean: FieldError[] = [];
    for (const d of list) {
        if (typeof d !== "object" || d === null) continue;
        const { field, code, message } = d as Record<string, unknown>;
        if (typeof field !== "string") continue;
        clean.push({ field, code: typeof code === "string" ? code : "", message: typeof message === "string" ? message : "" });
    }
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    clean.sort((a, b) => cmp(a.field, b.field) || cmp(a.code, b.code));
    return clean.length > MAX_DETAILS ? clean.slice(0, MAX_DETAILS) : clean;
}
