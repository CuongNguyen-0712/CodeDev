// @piece page-query: The rows of this page and the next cursor
// SELECT id, title, published_at FROM catalog.courses
// WHERE ($2::timestamptz IS NULL OR (published_at, id) < ($2, $3))
// ORDER BY published_at DESC, id DESC
// LIMIT $1 + 1
const pos = (c: Course): Position => [c.published_at, c.id];
const rows = scan
    .filter((c) => after === null || c.published_at <= after[0])
    .sort((x, y) => newerFirst(pos(x), pos(y)))
    .slice(0, size + 1);
const data = rows.slice(0, size);
const next_cursor = rows.length > size ? encodeCursor(pos(data[data.length - 1])) : null;
