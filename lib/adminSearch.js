/**
 * Admin search (Ctrl / Cmd + K) shared by the palette and GET /api/admin/search.
 * Each type is one result group; `permission` is what the viewer needs to see that group.
 */
export const SEARCH_TYPES = [
    { type: "user", label: "Users", permission: "user.read" },
    { type: "course", label: "Courses", permission: "admin.read" },
    { type: "challenge", label: "Challenges", permission: "admin.read" },
    { type: "order", label: "Orders", permission: "order.list" },
    { type: "run", label: "Runs", permission: "submission.read" },
];

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 100;

const PREFIX = new RegExp(`^(${SEARCH_TYPES.map((item) => item.type).join("|")}):\\s*`, "i");

/** "run: 01JC…" -> { type: "run", q: "01JC…" }; without a known prefix, type is null. */
export function parseScope(input) {
    const text = String(input ?? "").trimStart();
    const match = text.match(PREFIX);
    if (!match) return { type: null, q: text.trim().slice(0, SEARCH_MAX) };
    return { type: match[1].toLowerCase(), q: text.slice(match[0].length).trim().slice(0, SEARCH_MAX) };
}
