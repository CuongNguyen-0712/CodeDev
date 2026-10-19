// Wrong variant: cancels the previous search correctly, but reports the AbortError
// of every superseded search as "Search failed".
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
        onError(query, error.message);
      }
    },
    dispose() {
      controller?.abort();
      controller = null;
    },
  };
}
