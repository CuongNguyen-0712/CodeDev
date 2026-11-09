import { ApiError } from "@/lib/error/apiError";

export const encodeCursor = (at, id) => Buffer.from(JSON.stringify([at, id])).toString("base64url");

export function decodeCursor(raw, idPattern) {
    if (!raw) return null;
    try {
        const [createdAt, id] = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf-8"));
        if (/^\d{4}-\d{2}-\d{2}[ T][\d:.+-]{8,22}$/.test(createdAt) && idPattern.test(id)) return { createdAt, id };
    } catch {
        // fall through
    }
    throw new ApiError("Invalid cursor", 400);
}

// Callers fetch size + 1 rows; the extra row only signals that another page exists.
export const pageOf = (rows, size, cursorOf) => {
    const items = rows.slice(0, size);
    const last = items[items.length - 1];
    return { items: items.map(({ cursor_at, cursor_id, ...item }) => item), nextCursor: rows.length > size && last ? cursorOf(last) : null };
};
