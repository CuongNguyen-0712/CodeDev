// @piece cursor-codec: The cursor format and the order of courses
// Opaque cursor, so clients cannot depend on page numbers.
function encodeCursor(page: number): string {
    return Buffer.from(JSON.stringify({ page })).toString("base64url");
}

function decodeCursor(cursor: string): number | null {
    try {
        const { page } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        return Number.isInteger(page) && page >= 2 ? page : null;
    } catch {
        return null;
    }
}
