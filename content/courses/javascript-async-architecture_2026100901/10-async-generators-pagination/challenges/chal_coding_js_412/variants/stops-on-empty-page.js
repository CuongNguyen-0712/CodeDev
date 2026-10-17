// Wrong variant: treats an empty page as the end of the data, although nextCursor says otherwise.
async function* paginate(fetchPage) {
  let cursor = null;
  while (true) {
    const page = await fetchPage(cursor);
    if (page.items.length === 0) return;
    yield* page.items;
    if (page.nextCursor === null) return;
    cursor = page.nextCursor;
  }
}

async function* take(source, n) {
  if (n <= 0) return;
  let count = 0;
  for await (const item of source) {
    yield item;
    if (++count >= n) return;
  }
}
