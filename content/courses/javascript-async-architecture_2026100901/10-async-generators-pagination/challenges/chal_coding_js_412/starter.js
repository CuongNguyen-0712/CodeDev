/**
 * Lazily walks a cursor-paginated API and yields one item at a time.
 *
 * fetchPage(cursor) resolves to { items, nextCursor }. The first page is requested
 * with cursor null; the last page has nextCursor null.
 *
 * Requirements:
 *   - nothing is fetched until the consumer asks for the first item
 *   - the next page is fetched only when the items of the current page are used up
 *   - a page with no items but a nextCursor is NOT the end - keep going
 *
 * @template T
 * @param {(cursor: string | null) => Promise<{ items: T[], nextCursor: string | null }>} fetchPage
 * @returns {AsyncGenerator<T, void, undefined>}
 */
async function* paginate(fetchPage) {
  // TODO: request pages one by one (starting with cursor null) and yield their items
}

/**
 * Yields at most n values of `source`, then stops pulling from it.
 *
 * Requirements:
 *   - never pull value n + 1 from the source (it could trigger one more page request)
 *   - when it stops early, the source must be closed so its finally blocks run
 *   - n <= 0 yields nothing and does not pull from the source at all
 *
 * @template T
 * @param {AsyncIterable<T>} source
 * @param {number} n
 * @returns {AsyncGenerator<T, void, undefined>}
 */
async function* take(source, n) {
  // TODO: yield the first n values of source
}
