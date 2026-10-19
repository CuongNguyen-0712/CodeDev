// Wrong variant: relies on fetch rejecting with an AbortError and never checks the
// signal after the await - a source that ignores the signal still delivers stale answers.
function createSearchController({ search, onResults, onError }) {
  let controller = null;
  return {
    async input(query) {
      controller?.abort();
      controller = new AbortController();
      try {
        const results = await search(query, { signal: controller.signal });
        onResults(query, results);
      } catch (error) {
        if (error.name === "AbortError") return;
        onError(query, error.message);
      }
    },
    dispose() {
      controller?.abort();
      controller = null;
    },
  };
}
