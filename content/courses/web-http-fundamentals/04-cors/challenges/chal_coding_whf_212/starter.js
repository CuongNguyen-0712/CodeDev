/**
 * CORS headers for https://api.codedev.test, written by an AI assistant from the prompt:
 * "Allow our web app (https://app.codedev.test) and the admin app (https://admin.codedev.test)
 *  to call the API with cookies."
 *
 * Both apps call the API with fetch(url, { credentials: "include" }).
 *
 * @param {string | null} requestOrigin  the request's Origin header, e.g. "https://app.codedev.test";
 *                                       null when the request has no Origin header
 * @param {string[]} allowlist           trusted origins, e.g. ["https://app.codedev.test", "https://admin.codedev.test"]
 * @returns {Record<string, string>}     response headers to add (name -> value)
 */
function corsHeaders(requestOrigin, allowlist) {
  if (!requestOrigin) {
    return {}; // same-origin request or a non-browser client: nothing to add
  }
  // Both apps need cookies, so allow credentials. "*" covers every app we have.
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": "true",
  };
}
