/**
 * Reference solution (never shipped to learners).
 * Abort the previous request first, keep the new controller in a local variable, and
 * drop the outcome - result or error - whenever that controller's signal was aborted.
 */
function createSearchController({ search, onResults, onError }) {
  let controller = null;

  return {
    async input(query) {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const results = await search(query, { signal: current.signal });
        if (current.signal.aborted) return;
        onResults(query, results);
      } catch (error) {
        if (current.signal.aborted) return;
        onError(query, error.message);
      }
    },

    dispose() {
      controller?.abort();
      controller = null;
    },
  };
}
