// @piece list-query: Read page, limit and level from the query
const q = req.query;
let page = 1;
if (q.page !== undefined) {
    page = parseInt(q.page, 10) || 1;
    if (page < 1) return badRequest("page must be a positive integer");
}
let limit = 20;
if (q.limit !== undefined) {
    limit = Math.min(parseInt(q.limit, 10) || 20, 50);
    if (limit < 1) return badRequest("limit must be a positive integer");
}
let level: Level | undefined;
if (q.level !== undefined) {
    level = LEVELS.find((l) => l === q.level);
    if (level === undefined) return badRequest("level must be one of: beginner, intermediate, advanced");
}
