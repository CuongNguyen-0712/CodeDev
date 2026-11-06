// @piece list-query: Read page, limit and level from the query
const q = req.query;
let page = 1;
if (q.page !== undefined) {
    if (!/^[0-9]+$/.test(q.page) || Number(q.page) < 1) return badRequest("page must be a positive integer");
    page = Number(q.page);
}
let limit = 20;
if (q.limit !== undefined) {
    if (!/^[0-9]+$/.test(q.limit) || Number(q.limit) < 1) return badRequest("limit must be a positive integer");
    limit = Math.min(Number(q.limit), 50);
}
let level: Level | undefined;
if (q.level !== undefined) {
    level = LEVELS.find((l) => l === q.level.toLowerCase());
    if (level === undefined) return badRequest("level must be one of: beginner, intermediate, advanced");
}
