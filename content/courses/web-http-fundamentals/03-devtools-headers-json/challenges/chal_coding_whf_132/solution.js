/**
 * Reference solution (never shipped to learners).
 */
function classifyResponse(result) {
  if (result === null || typeof result !== "object") return "network";
  if (typeof result.networkError === "string" && result.networkError !== "") return "network";
  const { status } = result;
  if (status === undefined || status === null || status === 0) return "network";
  if (!Number.isInteger(status) || status < 100 || status > 599) return "unexpected";
  if (status >= 200 && status <= 299) return "success";
  if (status === 400 || status === 422) return "validation";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status >= 500) return "server";
  return "unexpected";
}
