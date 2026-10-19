// Wrong variant: latest-request-wins works while typing, but dispose() only drops the
// reference - the request keeps running and renders into the closed overlay.
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
      controller = null;
    },
  };
}
