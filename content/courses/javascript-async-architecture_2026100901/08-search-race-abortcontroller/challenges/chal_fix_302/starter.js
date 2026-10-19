/**
 * Search controller behind the package search overlay.
 *   input(query) - called on every input event; runs search(query, { signal })
 *   dispose()    - called when the overlay closes
 *
 * search(query, { signal }) behaves like fetch: when the signal is aborted it USUALLY
 * rejects with an AbortError - but some sources (a cache, a worker) ignore the signal
 * and answer anyway.
 *
 * Rules:
 *   - Only the latest query may ever call onResults(query, results) or onError(query, message).
 *   - Starting a new search cancels the previous one (abort its controller).
 *   - A cancelled search is not an error: it is silently dropped, whatever the source does.
 *   - dispose() cancels the search in flight; nothing is rendered afterwards.
 *
 * BUGS (from session replays): "react" shows results for "reac", users see
 * "Search failed" while typing, and results appear after the overlay was closed.
 *
 * @param {{
 *   search: (query: string, options: { signal: AbortSignal }) => Promise<string[]>,
 *   onResults: (query: string, results: string[]) => void,
 *   onError: (query: string, message: string) => void
 * }} deps
 * @returns {{ input(query: string): Promise<void>, dispose(): void }}
 */
function createSearchController({ search, onResults, onError }) {
  let controller = null;

  return {
    async input(query) {
      controller = new AbortController();
      try {
        const results = await search(query, { signal: controller.signal });
        onResults(query, results);
      } catch (error) {
        onError(query, error.message);
      }
    },

    dispose() {
      controller = null;
    },
  };
}
