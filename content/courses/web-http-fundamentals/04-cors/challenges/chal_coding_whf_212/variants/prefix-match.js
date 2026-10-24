// Wrong variant: echoes the origin with Vary, but matches with startsWith, so
// "https://app.codedev.test.evil.example" and "https://app.codedev.test:8443" are trusted.
function corsHeaders(requestOrigin, allowlist) {
  const headers = { Vary: "Origin" };
  if (requestOrigin && allowlist.some((allowed) => requestOrigin.startsWith(allowed))) {
    headers["Access-Control-Allow-Origin"] = requestOrigin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}
