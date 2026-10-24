// Wrong variant: treats every 4xx that is not auth or 404 as a validation error,
// so 405, 409 and 429 are shown as "fix your input".
function classifyResponse(result) {
  if (result === null || typeof result !== "object" || result.networkError) return "network";
  const { status } = result;
  if (!status) return "network";
  if (!Number.isInteger(status) || status < 100 || status > 599) return "unexpected";
  if (status >= 200 && status < 300) return "success";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status >= 400 && status < 500) return "validation";
  if (status >= 500) return "server";
  return "unexpected";
}
