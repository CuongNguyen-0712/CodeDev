// Wrong variant: loads every page into an array first, then yields -> take() cannot stop the fetching.
async function* paginate(fetchPage) {
  const all = [];
  let cursor = null;
  do {
    const page = await fetchPage(cursor);
    all.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== null);
  yield* all;
}

async function* take(source, n) {
  if (n <= 0) return;
  let count = 0;
  for await (const item of source) {
    yield item;
    if (++count >= n) return;
  }
}
