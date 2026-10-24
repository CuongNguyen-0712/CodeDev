/**
 * Reference solution (never shipped to learners).
 */
function corsHeaders(requestOrigin, allowlist) {
  // The answer depends on Origin, so caches must key on it - for every response, CORS or not.
  const headers = { Vary: "Origin" };
  // Whole-string match only: no prefix, suffix or substring checks.
  if (typeof requestOrigin === "string" && allowlist.includes(requestOrigin)) {
    headers["Access-Control-Allow-Origin"] = requestOrigin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}
