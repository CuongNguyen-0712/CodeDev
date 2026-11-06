// @piece read-cursor: Where this page starts
let page = 1;
if (query.cursor !== undefined) {
    const decoded = decodeCursor(query.cursor);
    if (decoded === null) return { status: 400, body: { code: "invalid_cursor" } };
    page = decoded;
}
