// @piece cursor-codec: The cursor format and the order of courses
// Keyset cursor: the position (published_at, id) of the last course on the page, versioned.
type Position = [string, number];

function encodeCursor(pos: Position): string {
    return Buffer.from(JSON.stringify({ v: 1, k: pos })).toString("base64url");
}

function decodeCursor(cursor: string): Position | null {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
    try {
        const { v, k } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        if (v !== 1 || !Array.isArray(k) || k.length !== 2) return null;
        if (typeof k[0] !== "string" || !Number.isInteger(k[1])) return null;
        return [k[0], k[1]];
    } catch {
        return null; // also a cursor issued by the old page-number version: the app restarts the list
    }
}

// Newest first: published_at DESC, then id DESC so that ties have one fixed order.
function newerFirst(a: Position, b: Position): number {
    return a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0;
}
