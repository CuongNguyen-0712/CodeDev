// Wrong variant: "anything below 400 worked", so redirects, 304 and 1xx count as success.
function classifyResponse(result) {
  if (result === null || typeof result !== "object" || result.networkError) return "network";
  const { status } = result;
  if (!status) return "network";
  if (!Number.isInteger(status) || status < 100 || status > 599) return "unexpected";
  if (status < 400) return "success";
  if (status === 400 || status === 422) return "validation";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status >= 500) return "server";
  return "unexpected";
}
