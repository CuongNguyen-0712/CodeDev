/**
 * Classify the result of an API call so the lesson player can show the right message.
 *
 * result is either
 *   - a received response:            { status, body }   (body is ignored: the status decides)
 *   - a request that got no response: { networkError: "timeout" | "offline" | "aborted" | ... }
 *
 * Returns one of: "success", "validation", "auth", "not_found", "server", "network", "unexpected".
 * The first matching rule wins:
 *   1. result is null or not an object                          -> "network"
 *   2. result.networkError is a non-empty string                -> "network" (even if a status is present)
 *   3. status is missing (undefined), null or 0                 -> "network"
 *   4. status is not an integer from 100 to 599 ("404", 404.5)  -> "unexpected"
 *   5. 200-299 -> "success"   400, 422 -> "validation"   401, 403 -> "auth"
 *      404 -> "not_found"     500-599 -> "server"
 *   6. any other status (1xx, 3xx, 405, 409, 429, ...)          -> "unexpected"
 *
 * Never throw.
 *
 * @param {{ status?: unknown, body?: unknown, networkError?: string } | null} result
 * @returns {string}
 */
function classifyResponse(result) {
  // TODO: first decide whether a response arrived at all, then classify its status.
  return "success";
}
