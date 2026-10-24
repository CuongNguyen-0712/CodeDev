// Wrong variant: the "fix" from many forum threads - reflect whatever Origin arrives.
// Browsers stop complaining, and every website can now read logged-in users' data.
function corsHeaders(requestOrigin, allowlist) {
  if (!requestOrigin) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": requestOrigin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}
