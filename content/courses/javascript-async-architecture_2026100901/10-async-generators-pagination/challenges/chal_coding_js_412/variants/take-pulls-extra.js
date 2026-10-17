// Wrong variant: checks the count at the top of the loop body, so value n + 1 is already pulled.
async function* paginate(fetchPage) {
  let cursor = null;
  do {
    const page = await fetchPage(cursor);
    yield* page.items;
    cursor = page.nextCursor;
  } while (cursor !== null);
}

async function* take(source, n) {
  let count = 0;
  for await (const item of source) {
    if (count >= n) break;
    count += 1;
    yield item;
  }
}
