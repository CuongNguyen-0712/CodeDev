// @piece run-search: Start this search and report its outcome
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
