// @piece run-search: Start this search and report its outcome
controller?.abort();
controller = new AbortController();
try {
  const results = await search(query, { signal: controller.signal });
  onResults(query, results);
} catch (error) {
  if (error.name === "AbortError") return;
  onError(query, error.message);
}
