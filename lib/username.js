/**
 * Username for a new OAuth user: ASCII `[a-z0-9_]`, 3-30 characters. The database adds a numeric
 * suffix when it is taken (public.sign_in_with_provider).
 */
export function usernameBase(raw) {
    const base = String(raw || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[đĐ]/g, "d")
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 30);

    return base.length >= 3 ? base : `user_${base}`.replace(/_$/, "");
}

/** "Nguyen Van A" -> { surname: "Nguyen Van", name: "A" }; one word fills both. */
export function splitDisplayName(full, fallback) {
    const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { surname: fallback, name: fallback };
    if (parts.length === 1) return { surname: parts[0], name: parts[0] };
    return { surname: parts.slice(0, -1).join(" "), name: parts.at(-1) };
}
