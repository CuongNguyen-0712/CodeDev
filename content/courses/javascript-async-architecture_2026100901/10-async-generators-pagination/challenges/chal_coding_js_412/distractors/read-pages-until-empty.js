// @piece read-pages: Request pages one by one and yield their items
let cursor = null;
while (true) {
  const page = await fetchPage(cursor);
  if (page.items.length === 0) return;
  yield* page.items;
  cursor = page.nextCursor;
}
