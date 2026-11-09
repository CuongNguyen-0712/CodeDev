// Tag rules shared by the server schema and the editor; free of the Markdown parser so the client can import it.
export const TAG_PATTERN = /^[a-z0-9-]{1,30}$/;

export const normalizeTag = (tag) => tag.trim().toLowerCase().replace(/\s+/g, "-");

/** Adds the typed parts to `current` (normalized, no duplicates, at most `max`); parts that break TAG_PATTERN come back in `invalid`. */
export function addTags(current, parts, max) {
    const tags = [...current];
    const invalid = [];
    for (const part of parts) {
        const tag = normalizeTag(part);
        if (!tag || tags.includes(tag)) continue;
        if (!TAG_PATTERN.test(tag)) invalid.push(tag);
        else if (tags.length < max) tags.push(tag);
    }
    return { tags, invalid };
}
