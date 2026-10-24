// Wrong variant: exact allowlist and echoed origin, but no Vary: Origin, so a shared cache
// can serve the admin app's headers to the web app (or a header-less response to either).
function corsHeaders(requestOrigin, allowlist) {
  if (!allowlist.includes(requestOrigin)) return {};
  return {
    "Access-Control-Allow-Origin": requestOrigin,
    "Access-Control-Allow-Credentials": "true",
  };
}
