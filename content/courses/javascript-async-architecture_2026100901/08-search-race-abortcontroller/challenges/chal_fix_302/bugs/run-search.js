// @piece run-search: Start this search and report its outcome
controller = new AbortController();
try {
  const results = await search(query, { signal: controller.signal });
  onResults(query, results);
} catch (error) {
  onError(query, error.message);
}
