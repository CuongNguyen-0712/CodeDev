// @piece page-query: The rows of this page and the next cursor
// SELECT id, title, published_at FROM catalog.courses
// ORDER BY published_at DESC
// LIMIT $1 OFFSET ($2 - 1) * $1
const sorted = [...scan].sort((a, b) => (a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : 0));
const offset = (page - 1) * size;
const data = sorted.slice(offset, offset + size);
const next_cursor = offset + size < sorted.length ? encodeCursor(page + 1) : null;
