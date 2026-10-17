/**
 * Reference solution (never shipped to learners).
 */
async function* paginate(fetchPage) {
  let cursor = null;
  do {
    const page = await fetchPage(cursor);
    yield* page.items;
    cursor = page.nextCursor;
  } while (cursor !== null && cursor !== undefined);
}

async function* take(source, n) {
  if (!(n > 0)) return;
  let count = 0;
  for await (const item of source) {
    yield item;
    count += 1;
    // Stop BEFORE asking the source for another value; leaving the loop calls source.return().
    if (count >= n) return;
  }
}
