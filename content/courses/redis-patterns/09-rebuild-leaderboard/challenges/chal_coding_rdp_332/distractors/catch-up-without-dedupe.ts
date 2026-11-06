// @piece catch-up: Apply the events that arrived during the rebuild
let cursor = watermark;
for (;;) {
    const page = db.eventsAfter(cursor, PAGE_SIZE);
    if (page.length === 0) break;
    for (const e of page) redis.zincrby(BOARD, e.points, e.learnerId);
    cursor = page[page.length - 1].id;
}
