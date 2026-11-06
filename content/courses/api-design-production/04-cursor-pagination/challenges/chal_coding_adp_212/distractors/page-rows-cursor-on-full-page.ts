// @piece page-rows: The page after the cursor and the next cursor
const sign = order === "asc" ? 1 : -1;
const key = (c: Course): [string, number] => [c.published_at, c.id];
const rows = table
    .filter((c) => after === null || sign * compareKey(key(c), after) > 0)
    .sort((a, b) => sign * compareKey(key(a), key(b)))
    .slice(0, limit);
const data = rows.slice(0, limit);
const last = data[data.length - 1];
const next_cursor = rows.length === limit ? encodeCursor({ v: 1, o: order, k: key(last) }) : null;
return { status: 200, data, next_cursor };
